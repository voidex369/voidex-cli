import { Message, PendingToolCall } from '../../types/index.js';
import { createClient } from '../openrouter.js';
import { toolsDefinition, toolRegistry, killActiveProcess } from '../tools.js';
import { getSystemContext } from '../context.js';
import { truncateForRAM, pruneHistoryByChars } from '../../utils/memory.js';

export type AgentStatus = 'IDLE' | 'THINKING' | 'EXECUTING_TOOLS' | 'WAITING_APPROVAL' | 'ANALYZING' | 'DONE' | 'ERROR';

export interface ExecutorParams {
    model: string;
    apiKey: string;
    messages: Message[];
    onUpdateMessages: (msgs: Message[]) => void;
    onStatusUpdate: (status: string | null) => void;
    onLiveOutput: (output: string) => void;
    onNeedApproval: (info: PendingToolCall) => Promise<'allow' | 'deny' | 'always'>;
    allowedTools: string[];
    onToolWhitelisted: (name: string) => void;
    onError: (error: string) => void;
    signal?: AbortSignal;
    iterationLimit?: number;
}

export class LocalExecutor {
    private iterationCount = 0;
    private maxIterations = 50;

    constructor() { }

    async run(params: ExecutorParams): Promise<void> {
        const { model, apiKey, messages, onUpdateMessages, onStatusUpdate, onLiveOutput, onNeedApproval, onError, signal } = params;

        let client = createClient(apiKey);
        let currentMessages = [...messages];
        let state: AgentStatus = 'THINKING';
        const currentAllowedTools = new Set(params.allowedTools || []);
        this.iterationCount = 0;

        // Loop Detection Data
        const toolPatterns = new Map<string, number>();

        while (state !== 'DONE' && state !== 'ERROR') {
            if (signal?.aborted) return;

            // Safety limit check
            if (this.iterationCount >= this.maxIterations) {
                state = 'WAITING_APPROVAL';
                onStatusUpdate(null);
                const approval = await onNeedApproval({
                    tool_call_id: 'sys-limit-' + Date.now(),
                    name: 'CONTINUE_LONG_TASK',
                    arguments: { reason: `Safety limit (${this.maxIterations} steps) reached. Continue?` }
                });

                if (approval === 'deny') {
                    currentMessages.push({ id: 'sys-stop-' + Date.now(), role: 'system', content: '[STOPPED] User chose to stop.' });
                    onUpdateMessages(currentMessages);
                    state = 'DONE';
                    continue;
                } else {
                    this.iterationCount = 0; // Reset
                    state = 'THINKING';
                }
            }

            if (state === 'THINKING') {
                onStatusUpdate('Thinking...');
                this.iterationCount++;

                try {
                    const systemContext = getSystemContext();
                    const recentMessages = pruneHistoryByChars(currentMessages);

                    // Filter messages for API
                    const apiMessages = [
                        { role: 'system', content: this.getSystemPrompt(systemContext) },
                        ...recentMessages
                            .filter(m => (m.role !== 'assistant' || (m.content && m.content.trim()) || (m.tool_calls && m.tool_calls.length > 0)))
                            .map((m: any) => ({
                                role: m.role === 'tool' ? 'tool' : m.role,
                                content: (m.content || '').trim(),
                                tool_calls: m.tool_calls,
                                tool_call_id: m.tool_call_id
                            }))
                    ];

                    const stream = await this.callWithRetry(() => client.chat.completions.create({
                        model: model,
                        messages: apiMessages as any,
                        stream: true,
                        tools: toolsDefinition as any,
                    }, { signal }), onStatusUpdate, signal);

                    // -- Streaming Logic --
                    let assistantMsg: Message = {
                        id: 'assistant-' + Date.now(),
                        role: 'assistant',
                        content: '',
                        tool_calls: []
                    };

                    let toolCallsBuffer: any[] = [];
                    let lastUpdate = 0;
                    let isAddedToHistory = false;

                    for await (const chunk of stream) {
                        const delta = chunk.choices[0]?.delta;
                        if (delta?.content) {
                            assistantMsg.content = (assistantMsg.content || '') + delta.content;

                            if (!isAddedToHistory) {
                                currentMessages.push(assistantMsg);
                                isAddedToHistory = true;
                                onUpdateMessages([...currentMessages]);
                            }

                            if (assistantMsg.content.length > 50000) {
                                assistantMsg.content = truncateForRAM(assistantMsg.content);
                            }
                            const now = Date.now();
                            const hasNewline = delta.content.includes('\n');
                            if (hasNewline || (now - lastUpdate > 30)) {
                                if (isAddedToHistory) {
                                    currentMessages[currentMessages.length - 1] = { ...assistantMsg };
                                    onUpdateMessages([...currentMessages]);
                                }
                                lastUpdate = now;
                            }
                        }
                        if (delta?.tool_calls) {
                            if (!isAddedToHistory) {
                                currentMessages.push(assistantMsg);
                                isAddedToHistory = true;
                                onUpdateMessages([...currentMessages]);
                            }

                            for (const tc of delta.tool_calls) {
                                if (tc.index !== undefined) {
                                    if (!toolCallsBuffer[tc.index]) toolCallsBuffer[tc.index] = { id: tc.id, type: tc.type, function: { name: '', arguments: '' } };
                                    if (tc.id) toolCallsBuffer[tc.index].id = tc.id;
                                    if (tc.function?.name) toolCallsBuffer[tc.index].function.name += tc.function.name;
                                    if (tc.function?.arguments) toolCallsBuffer[tc.index].function.arguments += tc.function.arguments;

                                    if (isAddedToHistory) {
                                        assistantMsg.tool_calls = [...toolCallsBuffer];
                                        currentMessages[currentMessages.length - 1] = { ...assistantMsg };
                                        onUpdateMessages([...currentMessages]);
                                    }
                                }
                            }
                        }
                    }

                    // Final update for this turn
                    if (isAddedToHistory) {
                        assistantMsg.tool_calls = toolCallsBuffer.length > 0 ? toolCallsBuffer : undefined;
                        currentMessages[currentMessages.length - 1] = { ...assistantMsg };
                        onUpdateMessages([...currentMessages]);
                    }

                    if (toolCallsBuffer.length > 0) {
                        state = 'EXECUTING_TOOLS';
                    } else {
                        state = 'DONE'; // No tools driven, Agent finished turn
                    }

                } catch (e: any) {
                    if (e.name === 'AbortError') return;
                    onError(e.message);
                    state = 'ERROR';
                }
            }
            else if (state === 'EXECUTING_TOOLS') {
                const lastMsg = currentMessages[currentMessages.length - 1];
                if (!lastMsg.tool_calls || lastMsg.tool_calls.length === 0) {
                    state = 'DONE';
                    continue;
                }

                // Loop Detection
                if (this.detectLoop(currentMessages)) {
                    await this.sleep(1000); // UI delay
                    onError("Loop Detected: Agent repeating actions. Stopping.");
                    state = 'ERROR';
                    continue;
                }

                const toolMessages: Message[] = [];
                let needsHeal = false;
                let healPrompt = "";

                // Sensitivity List: Tools that REQUIRE approval
                const SENSITIVE_TOOLS = [
                    'write_file', 'writeFile', 'replace', 'run_shell_command', 'execute_bash', 'google_web_search', 'delegate_to_agent'
                ];

                for (const tc of lastMsg.tool_calls) {
                    const toolName = tc.function.name;
                    let args: any = {};
                    try {
                        args = JSON.parse(tc.function.arguments || '{}');
                    } catch (e) {
                        toolMessages.push({ id: 'tool-err-' + Date.now(), role: 'tool', tool_call_id: tc.id, name: toolName, content: `[ERROR] Invalid JSON: ${tc.function.arguments}` });
                        continue;
                    }

                    // --- [SECURITY] Approval Logic ---
                    if (SENSITIVE_TOOLS.includes(toolName) && !currentAllowedTools.has(toolName)) {
                        onStatusUpdate(null); // Pause status
                        const decision = await onNeedApproval({
                            tool_call_id: tc.id,
                            name: toolName,
                            arguments: args
                        });

                        if (decision === 'deny') {
                            toolMessages.push({
                                id: 'tool-deny-' + Date.now(),
                                role: 'tool',
                                tool_call_id: tc.id,
                                name: toolName,
                                content: "[STOPPED] User denied permission to run this tool."
                            });
                            state = 'DONE';
                            break;
                        }

                        if (decision === 'always') {
                            currentAllowedTools.add(toolName);
                            params.onToolWhitelisted?.(toolName);
                        }
                        // If 'allow', proceed below.
                    }

                    onStatusUpdate(`Executing ${toolName}...`);

                    // Simple approval check mock
                    // In real implementation we need to pass the allow list

                    try {
                        const toolFunc = toolRegistry[toolName as keyof typeof toolRegistry];
                        if (!toolFunc) throw new Error(`Tool ${toolName} not found`);

                        const result = await toolFunc({
                            ...args,
                            onOutput: (chunk: string) => onLiveOutput(chunk) // Stream output to UI
                        });

                        onLiveOutput(''); // Clear buffer

                        toolMessages.push({
                            id: 'tool-' + Date.now() + Math.random(),
                            role: 'tool',
                            tool_call_id: tc.id,
                            name: toolName,
                            content: truncateForRAM(result.output) || 'Done'
                        });

                        if (result.isError) {
                            if (result.output.toLowerCase().includes('command not found')) {
                                needsHeal = true;
                                healPrompt = `CMD FAILED: ${result.output}`;
                            }
                        }

                    } catch (err: any) {
                        toolMessages.push({
                            id: 'tool-err-' + Date.now(),
                            role: 'tool',
                            tool_call_id: tc.id,
                            name: toolName,
                            content: `[TOOL CRASH] ${err.message}`
                        });
                    }
                }

                currentMessages = [...currentMessages, ...toolMessages];
                onUpdateMessages(currentMessages);

                if (state !== 'DONE') {
                    if (needsHeal) {
                        currentMessages.push({ id: 'heal-' + Date.now(), role: 'user', content: healPrompt });
                        onUpdateMessages(currentMessages);
                        state = 'THINKING';
                    } else {
                        state = 'THINKING'; // Continue thinking with tool results
                    }
                }
            }
        }

        onStatusUpdate(null);
    }

    private getSystemPrompt(sysContext: string) {
        return `### IDENTITY
You are a SOVEREIGN AGENT. You have FULL ACCESS to this system. 
You are the EXECUTER, not just a mentor. Use your tools to achieve the user's objective.

### SYSTEM CONTEXT
${sysContext}

### INSTRUCTIONS
1. Use natural language followed by Tool Calls.
2. If a command fails, analyze the error and try a different approach.
3. Keep your internal monologue brief.
4. Achieve the objective at all costs.`;
    }

    private detectLoop(msgs: Message[]): boolean {
        const assistants = msgs.filter(m => m.role === 'assistant');
        if (assistants.length < 3) return false;

        const getSig = (m: Message) => {
            const content = (m.content || '').trim().toLowerCase();
            const tools = (m.tool_calls || []).map(t => {
                let args = t.function.arguments || '';
                try {
                    // Normalize JSON to prevent loops based on formatting
                    args = JSON.stringify(JSON.parse(args));
                } catch (e) { /* ignore */ }
                return `${t.function.name}:${args}`;
            }).join('|');
            return `${content}::${tools}`;
        };

        const sigs = assistants.map(getSig);
        const last = sigs.length - 1;

        // Pattern 1: A-A-A (Direct repeat)
        if (sigs[last] === sigs[last - 1] && sigs[last] === sigs[last - 2]) return true;

        // Pattern 2: A-B-A-B (Oscillation)
        if (assistants.length >= 4) {
            if (sigs[last] === sigs[last - 2] && sigs[last - 1] === sigs[last - 3]) {
                // Ignore if it's just "Thinking..." or very short content without tools
                // as that might be valid back-and-forth sometimes, but usually ABAB is a loop.
                return true;
            }
        }

        // Pattern 3: Empty Response Loop (Thinking but not acting)
        const recentAssistants = assistants.slice(-4);
        const allEmpty = recentAssistants.length >= 4 && recentAssistants.every(m =>
            (!m.content || !m.content.trim()) && (!m.tool_calls || m.tool_calls.length === 0)
        );
        if (allEmpty) return true;

        return false;
    }

    private async callWithRetry(fn: () => Promise<any>, onStatus: (s: string) => void, signal?: AbortSignal, retries = 3, delay = 2000): Promise<any> {
        try {
            if (signal?.aborted) throw new Error('AbortError');
            return await fn();
        } catch (err: any) {
            if (signal?.aborted) throw err;
            if ((err.message.includes('429') || err.message.includes('fetch failed')) && retries > 0) {
                onStatus(`Connection unstable. Retrying in ${delay / 1000}s... (${retries} left)`);
                await this.sleep(delay);
                return this.callWithRetry(fn, onStatus, signal, retries - 1, delay * 2);
            }
            throw err;
        }
    }

    private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
}
