import { Message, PendingToolCall } from '../../types/index.js';
import { createClient } from '../openrouter.js';
import { toolsDefinition, toolRegistry } from '../tools.js';
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

    // [BARU] RISK ANALYZER ENGINE v3 (RECON FRIENDLY) 🧠
    private analyzeRisk(toolName: string, args: any): { level: 'safe' | 'caution' | 'critical', reason?: string } {
        // 1. CEK SHELL COMMAND
        if (toolName === 'run_shell_command' || toolName === 'execute_bash') {
            const cmd = (args.command || '').trim();

            // --- A. CRITICAL (NUCLEAR TIER) - Butuh Kode Verifikasi ---
            // Hanya untuk perintah yang MEMATIKAN SISTEM atau HAPUS MASSAL.
            if (/(^|\s)rm\s+(-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*)\s+/.test(cmd)) return { level: 'critical', reason: 'Force Delete (rm -rf)' };
            if (/(^|\s)mkfs/.test(cmd)) return { level: 'critical', reason: 'Format Disk' };
            if (/(^|\s)dd\s+/.test(cmd)) return { level: 'critical', reason: 'Low-level Disk Write' };
            if (/(^|\s):(){:|:&};:/.test(cmd)) return { level: 'critical', reason: 'Fork Bomb Detected' };
            if (/(^|\s)(shutdown|reboot|init\s+0|init\s+6)/.test(cmd)) return { level: 'critical', reason: 'System Power Control' };

            // --- B. CAUTION (MODERATE TIER) - Butuh Y/N ---
            // Root access & System modification.
            if (/(^|\s)sudo\s+/.test(cmd)) return { level: 'caution', reason: 'Root Access (sudo)' };
            if (/(^|\s)(chmod|chown)\s+/.test(cmd)) return { level: 'caution', reason: 'Permission Modification' };

            // Cek Redirection (>) yang BERBAHAYA
            // Abaikan jika ke /dev/null, /tmp/, atau stdout/stderr (&1, &2)
            // Regex logic: Ada tanda > TAPI BUKAN (> /dev/null, > /tmp/, 2>&1, 1>&2)
            const isRedirection = />/.test(cmd);
            const isSafeRedirection = />\s*(\/dev\/null|\/tmp\/|&1|&2)/.test(cmd) || /2>&1/.test(cmd);

            if (isRedirection && !isSafeRedirection) {
                return { level: 'caution', reason: 'File Overwrite' };
            }

            // --- C. SAFE (GREEN TIER) - Langsung Jalan ---
            // Recon tools (curl, wget, nmap, ping, dig) umumnya aman SELAMA outputnya ke stdout atau /tmp/
            // Kita sudah filter redirection bahaya di atas, jadi sisanya dianggap aman.
            return { level: 'safe' };
        }

        // 2. CEK FILE SYSTEM TOOLS (Node.js API)
        const FILE_MOD_TOOLS = ['write_file', 'writeFile', 'replace'];
        if (FILE_MOD_TOOLS.includes(toolName)) {
            return { level: 'caution', reason: 'Modify File Content' };
        }

        // 3. CEK DELEGASI AGENT
        if (toolName === 'delegate_to_agent') {
            return { level: 'caution', reason: 'Sub-Agent Delegation' };
        }

        // Sisanya (read_file, search, dll) dianggap SAFE
        return { level: 'safe' };
    }

    async run(params: ExecutorParams): Promise<void> {
        const { model, apiKey, messages, onUpdateMessages, onStatusUpdate, onLiveOutput, onNeedApproval, onError, signal } = params;

        let client = createClient(apiKey);
        let currentMessages = [...messages];
        let state: AgentStatus = 'THINKING';
        const currentAllowedTools = new Set(params.allowedTools || []);
        this.iterationCount = 0;

        while (state !== 'DONE' && state !== 'ERROR') {
            if (signal?.aborted) return;

            // Safety limit check
            if (this.iterationCount >= this.maxIterations) {
                state = 'WAITING_APPROVAL';
                onStatusUpdate('Safety Limit Reached. Waiting approval...');

                const approval = await onNeedApproval({
                    tool_call_id: 'sys-limit-' + Date.now(),
                    name: 'CONTINUE_LONG_TASK',
                    arguments: { reason: `Safety limit (${this.maxIterations} steps) reached. Continue?` },
                    riskLevel: 'caution'
                });

                if (approval === 'deny') {
                    currentMessages.push({ id: 'sys-stop-' + Date.now(), role: 'system', content: '[STOPPED] User chose to stop.' });
                    onUpdateMessages(currentMessages);
                    state = 'DONE';
                    continue;
                } else {
                    this.iterationCount = 0;
                    state = 'THINKING';
                }
            }

            if (state === 'THINKING') {
                onStatusUpdate('Thinking...');
                this.iterationCount++;

                try {
                    const systemContext = getSystemContext();
                    const recentMessages = pruneHistoryByChars(currentMessages);

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

                    let assistantMsg: Message = { id: 'assistant-' + Date.now(), role: 'assistant', content: '', tool_calls: [] };
                    let toolCallsBuffer: any[] = [];
                    let lastUpdate = 0;
                    let isAddedToHistory = false;

                    for await (const chunk of stream) {
                        const delta = chunk.choices[0]?.delta;
                        const now = Date.now();
                        let hasChanges = false;

                        if (delta?.content) {
                            assistantMsg.content = (assistantMsg.content || '') + delta.content;
                            if (assistantMsg.content.length > 50000) assistantMsg.content = truncateForRAM(assistantMsg.content);
                            hasChanges = true;
                        }

                        if (delta?.tool_calls) {
                            for (const tc of delta.tool_calls) {
                                if (tc.index !== undefined) {
                                    if (!toolCallsBuffer[tc.index]) toolCallsBuffer[tc.index] = { id: tc.id, type: tc.type, function: { name: '', arguments: '' } };
                                    if (tc.id) toolCallsBuffer[tc.index].id = tc.id;
                                    if (tc.function?.name) toolCallsBuffer[tc.index].function.name += tc.function.name;
                                    if (tc.function?.arguments) toolCallsBuffer[tc.index].function.arguments += tc.function.arguments;
                                }
                            }
                            assistantMsg.tool_calls = [...toolCallsBuffer];
                            hasChanges = true;
                        }

                        if (hasChanges) {
                            if (!isAddedToHistory) {
                                currentMessages.push(assistantMsg);
                                isAddedToHistory = true;
                                onUpdateMessages([...currentMessages]);
                                lastUpdate = now;
                            } else if (now - lastUpdate > 150) {
                                currentMessages[currentMessages.length - 1] = { ...assistantMsg };
                                onUpdateMessages([...currentMessages]);
                                lastUpdate = now;
                            }
                        }
                    }

                    if (isAddedToHistory) {
                        if (toolCallsBuffer.length > 0) assistantMsg.tool_calls = toolCallsBuffer;
                        currentMessages[currentMessages.length - 1] = { ...assistantMsg };
                        onUpdateMessages([...currentMessages]);
                    }

                    state = toolCallsBuffer.length > 0 ? 'EXECUTING_TOOLS' : 'DONE';

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

                if (this.detectLoop(currentMessages)) {
                    await this.sleep(1000);
                    onError("Loop Detected: Agent repeating actions. Stopping.");
                    state = 'ERROR';
                    continue;
                }

                const toolMessages: Message[] = [];
                let needsHeal = false;
                let healPrompt = "";

                for (const tc of lastMsg.tool_calls) {
                    const toolName = tc.function.name;
                    let args: any = {};
                    try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) {
                        toolMessages.push({ id: 'tool-err-' + Date.now(), role: 'tool', tool_call_id: tc.id, name: toolName, content: `[ERROR] Invalid JSON: ${tc.function.arguments}` });
                        continue;
                    }

                    // [V3] Risk Analyzer
                    const risk = this.analyzeRisk(toolName, args);

                    // Needs Approval Logic
                    const needsApproval = risk.level === 'critical' || (!currentAllowedTools.has(toolName) && risk.level !== 'safe');

                    if (needsApproval) {
                        onStatusUpdate('Security Check...');

                        const challengeCode = risk.level === 'critical'
                            ? Math.floor(1000 + Math.random() * 9000).toString()
                            : undefined;

                        const decision = await onNeedApproval({
                            tool_call_id: tc.id,
                            name: toolName,
                            arguments: args,
                            riskLevel: risk.level,
                            challengeCode: challengeCode
                        });

                        if (decision === 'deny') {
                            toolMessages.push({ id: 'tool-deny-' + Date.now(), role: 'tool', tool_call_id: tc.id, name: toolName, content: "[STOPPED] User denied permission." });
                            state = 'DONE';
                            break;
                        }

                        if (decision === 'always' && risk.level !== 'critical') {
                            currentAllowedTools.add(toolName);
                            params.onToolWhitelisted?.(toolName);
                        }
                    }

                    onStatusUpdate(`Executing ${toolName}...`);

                    try {
                        const toolFunc = toolRegistry[toolName as keyof typeof toolRegistry];
                        if (!toolFunc) throw new Error(`Tool ${toolName} not found`);

                        const result = await toolFunc({ ...args, onOutput: (chunk: string) => onLiveOutput(chunk) });

                        onLiveOutput('');
                        toolMessages.push({
                            id: 'tool-' + Date.now() + Math.random(),
                            role: 'tool',
                            tool_call_id: tc.id,
                            name: toolName,
                            content: truncateForRAM(result.output) || 'Done'
                        });

                        if (result.isError && result.output.toLowerCase().includes('command not found')) {
                            needsHeal = true;
                            healPrompt = `CMD FAILED: ${result.output}`;
                        }
                    } catch (err: any) {
                        toolMessages.push({ id: 'tool-err-' + Date.now(), role: 'tool', tool_call_id: tc.id, name: toolName, content: `[TOOL CRASH] ${err.message}` });
                    }
                }

                currentMessages = [...currentMessages, ...toolMessages];
                onUpdateMessages(currentMessages);

                if (state !== 'DONE') {
                    if (needsHeal) {
                        currentMessages.push({ id: 'heal-' + Date.now(), role: 'user', content: healPrompt });
                        state = 'THINKING';
                    } else {
                        state = 'THINKING';
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
                    args = JSON.stringify(JSON.parse(args));
                } catch (e) { /* ignore */ }
                return `${t.function.name}:${args}`;
            }).join('|');
            return `${content}::${tools}`;
        };

        const sigs = assistants.map(getSig);
        const last = sigs.length - 1;
        if (sigs[last] === sigs[last - 1] && sigs[last] === sigs[last - 2]) return true;
        if (assistants.length >= 4) {
            if (sigs[last] === sigs[last - 2] && sigs[last - 1] === sigs[last - 3]) return true;
        }
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
                onStatus(`Connection unstable. Retrying in ${delay / 1000}s...`);
                await this.sleep(delay);
                return this.callWithRetry(fn, onStatus, signal, retries - 1, delay * 2);
            }
            throw err;
        }
    }

    private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
}