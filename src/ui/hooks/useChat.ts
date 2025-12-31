import { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '../../lib/openrouter.js';
import {
    getGenericConfig, getApiKey, getAvailableModels, saveModel, saveApiKey,
    saveChat, loadChat, listChats, deleteChat, exportChat
} from '../../lib/config.js';
import { toolsDefinition, toolRegistry, killActiveProcess } from '../../lib/tools.js';
import { getSystemContext } from '../../lib/context.js';
import os from 'os';
import fs from 'fs';
import path from 'path';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
}

export interface PendingToolCall {
    tool_call_id: string;
    name: string;
    arguments: any;
}

// --- SHADOW PERSISTENCE LAYER ---
// This keeps the chat state alive even when useChat is unmounted (e.g. during ModelPicker)
let shadowMessages: Message[] = [{ id: 'welcome', role: 'system', name: 'welcome_msg', content: '' }];
let shadowAllowedTools: string[] = [];
let shadowHistory: string[] = [];

// --- EXTREME MEMORY LIMITS ---
const MAX_CONTENT_LENGTH = 50000; // 50KB hard-limit for strings in state

/**
 * Truncates content aggressively BEFORE it enters the React state/Shadow.
 */
function truncateForRAM(content: string | null): string | null {
    if (!content) return content;
    if (content.length > MAX_CONTENT_LENGTH) {
        return content.slice(0, MAX_CONTENT_LENGTH) + "\n\n... [ TRUNCATED AT 50KB FOR EXTREME RAM STABILITY ] ...";
    }
    return content;
}


export function useChat() {
    const config = getGenericConfig();
    const currentApiKey = getApiKey();

    const [messages, setMessages] = useState<Message[]>(shadowMessages);
    // Ref to hold the latest messages without triggering re-renders in callbacks
    const messagesRef = useRef<Message[]>(shadowMessages);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [agentStatus, setAgentStatus] = useState<string | null>(null);
    const [activeDialog, setActiveDialog] = useState<null | 'model' | 'auth'>(null);
    const [pendingApproval, setPendingApproval] = useState<PendingToolCall | null>(null);
    const [allowedToolsForSession, setAllowedToolsForSession] = useState<string[]>(shadowAllowedTools);
    const allowedToolsRef = useRef<string[]>(shadowAllowedTools);

    const [liveToolOutput, setLiveToolOutput] = useState<string>('');
    const [history, setHistory] = useState<string[]>(shadowHistory);

    const currentRequestIdRef = useRef<number>(0);

    // Sync state with shadow and refs on every change
    useEffect(() => {
        shadowMessages = messages;
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        shadowHistory = history;
    }, [history]);

    useEffect(() => {
        shadowAllowedTools = allowedToolsForSession;
        allowedToolsRef.current = allowedToolsForSession;
    }, [allowedToolsForSession]);

    const approvalResolver = useRef<((choice: 'allow' | 'deny' | 'always') => void) | null>(null);

    const getSovereignPrompt = useCallback(() => {
        const sysContext = getSystemContext();
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
    }, []);

    const abortController = useRef<AbortController | null>(null);

    const stopLoading = useCallback(() => {
        // 1. Abort AI Generation
        if (abortController.current) {
            abortController.current.abort();
            abortController.current = null;
        }
        // 2. Clear current request ID to ignore stray updates
        currentRequestIdRef.current++;

        // 3. Kill Active Tool Process (Shell)
        const killed = killActiveProcess();
        if (killed) {
            setMessages(prev => [...prev, { id: 'sys-' + Date.now(), role: 'system', content: '[NOTICE] Active process terminated by user.' }]);
        }

        setIsLoading(false);
        setAgentStatus(null);
    }, []);

    const processStream = async (stream: any, currentMessages: Message[], client: any, config: any, iterationCount: number, signal: AbortSignal, requestId: number) => {
        if (iterationCount > 20) {
            if (requestId === currentRequestIdRef.current) {
                setMessages(prev => [...prev, {
                    id: 'sys-limit-' + Date.now(),
                    role: 'system',
                    content: '[ERROR] Max tool iteration limit (20) reached. Stopping infinite loop.'
                }]);
            }
            return;
        }

        let assistantMsg: Message = {
            id: 'assistant-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            role: 'assistant',
            content: '',
            tool_calls: []
        };

        // Add placeholder
        setMessages((prev) => [...prev, assistantMsg]);

        let toolCallsBuffer: any[] = [];
        let lastUpdate = 0;
        const UPDATE_INTERVAL = 100; // Update UI every 100ms max

        try {
            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;

                if (delta?.content) {
                    assistantMsg.content = (assistantMsg.content || '') + delta.content;

                    // PRE-STATE TRUNCATION (Live)
                    if ((assistantMsg.content?.length || 0) > MAX_CONTENT_LENGTH) {
                        assistantMsg.content = truncateForRAM(assistantMsg.content);
                    }

                    // THROTTLED UPDATE: Only update UI if TTY or interval reached
                    const now = Date.now();
                    const isTTY = process.stdout.isTTY;

                    if (isTTY && (now - lastUpdate > UPDATE_INTERVAL)) {
                        if (requestId === currentRequestIdRef.current) {
                            setMessages((prev) => {
                                const newMsgs = [...prev];
                                newMsgs[newMsgs.length - 1] = { ...assistantMsg };
                                return newMsgs;
                            });
                        }
                        lastUpdate = now;
                    }
                }

                if (delta?.tool_calls) {
                    const tcChunk = delta.tool_calls;
                    for (const tc of tcChunk) {
                        if (tc.index !== undefined) {
                            if (!toolCallsBuffer[tc.index]) {
                                toolCallsBuffer[tc.index] = { id: tc.id, type: tc.type, function: { name: tc.function?.name || '', arguments: '' } };
                            }
                            if (tc.id) toolCallsBuffer[tc.index].id = tc.id;
                            if (tc.function?.name) toolCallsBuffer[tc.index].function.name = tc.function.name;
                            if (tc.function?.arguments) toolCallsBuffer[tc.index].function.arguments += tc.function.arguments;
                        }
                    }
                }
            }
        } catch (e: any) {
            if (e.name === 'AbortError') return;
            throw e;
        }

        // FINAL UPDATE: Ensure last content is displayed
        if (requestId === currentRequestIdRef.current) {
            setMessages((prev) => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1] = { ...assistantMsg };
                return newMsgs;
            });
        }

        if (toolCallsBuffer.length > 0) {
            assistantMsg.tool_calls = toolCallsBuffer;
            setMessages((prev) => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1] = { ...assistantMsg };
                return newMsgs;
            });

            try {
                const toolMessages: Message[] = [];
                for (const tc of assistantMsg.tool_calls || []) {
                    const toolName = tc.function.name;
                    let args = {};
                    try { args = JSON.parse(tc.function.arguments); } catch (e) { }

                    const needsApproval = ['write_file', 'writeFile', 'replace'].includes(toolName);
                    const isWhitelisted = allowedToolsRef.current.includes(toolName);

                    let proceed = true;
                    if (needsApproval && !isWhitelisted) {
                        setAgentStatus(`Awaiting approval for ${toolName}...`);
                        setPendingApproval({ tool_call_id: tc.id, name: toolName, arguments: args });

                        const choice = await new Promise<'allow' | 'deny' | 'always'>((resolve) => {
                            approvalResolver.current = resolve;
                        });

                        setPendingApproval(null);
                        approvalResolver.current = null;

                        if (choice === 'deny') {
                            const denyMsg: Message = {
                                id: 'tool-deny-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
                                role: 'tool',
                                tool_call_id: tc.id,
                                name: toolName,
                                content: 'User denied this operation.'
                            };
                            toolMessages.push(denyMsg);
                            setMessages(prev => [...prev, denyMsg]);
                            proceed = false;
                        } else if (choice === 'always') {
                            setAllowedToolsForSession(prev => [...prev, toolName]);
                        }
                    }

                    if (proceed) {
                        setAgentStatus(`Executing ${toolName}...`);
                        const toolFunc = toolRegistry[toolName as keyof typeof toolRegistry];
                        if (toolFunc) {
                            let chunkBuffer = '';
                            const result = await toolFunc({
                                ...args,
                                onOutput: (chunk: string) => {
                                    chunkBuffer += chunk;
                                    const now = Date.now();
                                    const isTTY = process.stdout.isTTY;
                                    if (isTTY && (now - lastUpdate > UPDATE_INTERVAL)) {
                                        const pending = chunkBuffer;
                                        chunkBuffer = '';
                                        setLiveToolOutput(prev => {
                                            const next = prev + pending;
                                            return next.length > 5000 ? next.slice(-5000) : next;
                                        });
                                        lastUpdate = now;
                                    }
                                }
                            });

                            // Flush any remaining bit in the buffer
                            if (chunkBuffer) {
                                setLiveToolOutput(prev => {
                                    const next = prev + chunkBuffer;
                                    return next.length > 5000 ? next.slice(-5000) : next;
                                });
                            }

                            // Keep output visible for a moment while transition to result analysis
                            await new Promise(r => setTimeout(r, 800));
                            setLiveToolOutput('');

                            const safeOutput = truncateForRAM(result.output);
                            const resMsg: Message = {
                                id: 'tool-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
                                role: 'tool',
                                tool_call_id: tc.id,
                                name: toolName,
                                content: safeOutput
                            };
                            toolMessages.push(resMsg);
                            setMessages(prev => [...prev, resMsg]);

                            if (result.isError) break;
                        } else {
                            const errorMsg: Message = {
                                id: 'tool-err-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
                                role: 'tool',
                                tool_call_id: tc.id,
                                name: toolName,
                                content: `Error: Tool ${toolName} not found`
                            };
                            toolMessages.push(errorMsg);
                            setMessages(prev => [...prev, errorMsg]);
                            break;
                        }
                    }
                }

                let needsHeal = false;
                let healPrompt = "";
                for (const tm of toolMessages) {
                    const output = tm.content?.toLowerCase() || "";
                    if (output.includes("command not found") || output.includes("is not installed")) {
                        needsHeal = true;
                        healPrompt = `CMD FAILED: The output says the command is missing. Use the PACKAGE_MANAGER from system context to install it, then try the task again. Output: ${output}`;
                        break;
                    }
                }

                setAgentStatus(needsHeal ? 'Auto-Healing...' : 'Analyzing result...');

                const nextMessages = [...currentMessages, assistantMsg, ...toolMessages];
                if (needsHeal) {
                    nextMessages.push({ id: Date.now().toString() + 'heal', role: 'user', content: healPrompt });
                }

                await new Promise(resolve => setTimeout(resolve, 1000));

                // --- PINNED CONTEXT & SLIDING WINDOW ---
                // We ALWAYS include the first USER message to keep the original goal in mind.
                const firstUserIdx = nextMessages.findIndex(m => m.role === 'user');
                const firstUserMsg = firstUserIdx !== -1 ? nextMessages[firstUserIdx] : null;

                const windowSize = 30;
                // Get the last N messages, but EXCLUDE the first user message if it's already there to avoid double inclusion
                let recentMessages = nextMessages.slice(-windowSize);
                if (firstUserMsg && !recentMessages.find(m => m.id === firstUserMsg.id)) {
                    // Prepend the pinned goal if it was sliced out
                    recentMessages = [firstUserMsg, ...recentMessages];
                }

                // ZOMBIE CHECK: If user aborted during tool execution, STOP here.
                if (!abortController.current) return;

                // DETECT LOGIC LOOPS: (Content + Action check)
                const assistants = nextMessages.filter(m => m.role === 'assistant');
                if (assistants.length >= 2) {
                    const last = assistants[assistants.length - 1];
                    const prev = assistants[assistants.length - 2];

                    // Fuzzy comparison: remove emojis, extra whitespace, and lowercase
                    const clean = (s: string | null) => (s || '').replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').toLowerCase().trim();
                    const lastClean = clean(last.content);
                    const prevClean = clean(prev.content);

                    // Check if BOTH content and first tool call are identical
                    const lastCmd = last.tool_calls?.[0] ? JSON.stringify(last.tool_calls[0].function) : null;
                    const prevCmd = prev.tool_calls?.[0] ? JSON.stringify(prev.tool_calls[0].function) : null;

                    if (lastClean === prevClean && lastCmd === prevCmd && lastClean !== "") {
                        setError("Logic Loop detected (AI is repeating itself). Please change your instruction or use /forget to reset the last turn.");
                        setIsLoading(false);
                        return;
                    }
                }

                // ONLY RECURSE IF TOOLS WERE CALLED OR HEAL NEEDED
                if (toolCallsBuffer.length === 0 && !needsHeal) {
                    setIsLoading(false);
                    setAgentStatus(null);
                    return;
                }

                const nextStream = await client.chat.completions.create({
                    model: config.model,
                    messages: [
                        { role: 'system', content: getSovereignPrompt() },
                        ...recentMessages
                            .filter(m => (m.role !== 'assistant' || (m.content && m.content.trim()) || (m.tool_calls && m.tool_calls.length > 0)))
                            .map(m => ({
                                role: m.role,
                                content: (m.content || '').trim(),
                                tool_calls: m.tool_calls,
                                tool_call_id: m.tool_call_id
                            }))
                    ],
                    stream: true,
                    tools: toolsDefinition as any,
                }, { signal });
                await processStream(nextStream, nextMessages, client, config, iterationCount + 1, signal, requestId);
            } catch (e: any) {
                if (e.name === 'AbortError' || requestId !== currentRequestIdRef.current) return;
                console.error("Stream processing error:", e); // Log for debug
                if (e.message.includes('429')) {
                    setError('Rate limit hit (429). Try again in a moment.');
                } else if (e.message.includes('context_length_exceeded') || e.code === 'context_length_exceeded') {
                    setError('Context limit exceeded. Please use /clear to reset memory.');
                } else {
                    setError(`Connection Error: ${e.message}`);
                }
            }
        }
    };

    // STABLE SEND MESSAGE - No dependencies on 'messages' or 'allowedTools'
    const sendMessage = useCallback(async (rawContent: string) => {
        const content = rawContent.trim();
        if (!content) return;

        const currentConfig = getGenericConfig();
        const latestApiKey = getApiKey();

        if (!latestApiKey && !content.startsWith('/auth')) {
            setError('API Key is missing. Use /auth to set it.');
            setAgentStatus(null);
            return;
        }

        const lowerContent = content.toLowerCase();

        if (lowerContent === '/clear') {
            const welcome = [
                { id: 'welcome-' + Date.now(), role: 'system', name: 'welcome_msg', content: '' },
                { id: 'sys-' + Date.now(), role: 'system', content: '[SUCCESS] Chat history and screen cleared.' }
            ] as Message[];
            setMessages(welcome);
            shadowMessages = welcome;
            return;
        }
        if (lowerContent === '/model') {
            setActiveDialog('model');
            return;
        }
        if (content.startsWith('SYSTEM_MODEL_CHANGED:')) {
            const newModel = content.split(':')[1];
            setMessages(prev => [...prev, { id: 'sys-' + Date.now(), role: 'system', content: `[CONFIG] Model successfully changed to: ${newModel}` }]);
            return;
        }
        if (content.startsWith('SYSTEM_AUTH_CHANGED:')) {
            setMessages(prev => [...prev, { id: 'sys-' + Date.now(), role: 'system', content: `[CONFIG] API Key updated successfully.` }]);
            return;
        }
        if (lowerContent === '/auth') {
            setActiveDialog('auth');
            return;
        }
        if (lowerContent.startsWith('/chat')) {
            const parts = content.split(/\s+/);
            const sub = parts[1]?.toLowerCase();
            const arg = parts[2];
            const currentHistory = messagesRef.current;

            if (sub === 'save' && arg) {
                saveChat(arg, currentHistory);
                setMessages(prev => [...prev, { id: 'sys-' + Date.now(), role: 'system', content: `Chat saved as "${arg}"` }]);
                return;
            }
            if (sub === 'resume' && arg) {
                const loaded = loadChat(arg);
                if (loaded.length > 0) {
                    setMessages(loaded);
                } else {
                    setMessages(prev => [...prev, { id: 'sys-' + Date.now(), role: 'system', content: `Chat "${arg}" not found or empty.` }]);
                }
                return;
            }
            if (sub === 'list') {
                const list = listChats();
                const contentText = list.length > 0 ? `Saved chats:\n${list.join('\n')}` : "No saved chats found.";
                setMessages(prev => [...prev, { id: 'sys-' + Date.now(), role: 'system', content: contentText }]);
                return;
            }
            if (sub === 'delete' && arg) {
                const success = deleteChat(arg);
                const msg = success ? `Chat "${arg}" deleted.` : `Chat "${arg}" not found.`;
                setMessages(prev => [...prev, { id: 'sys-' + Date.now(), role: 'system', content: msg }]);
                return;
            }
            if (sub === 'share' && arg) {
                exportChat(arg, currentHistory);
                setMessages(prev => [...prev, { id: 'sys-' + Date.now(), role: 'system', content: `Chat shared to: ${arg}` }]);
                return;
            }

            // Show usage if command is incomplete or invalid sub-command
            const usage = `Usage: /chat [save <id> | resume <id> | list | delete <id> | share <file>]`;
            setMessages(prev => [...prev, { id: 'sys-' + Date.now(), role: 'system', content: usage }]);
            return;
        }
        if (lowerContent === '/tools') {
            const toolList = toolsDefinition.map(t => `- ${t.function.name}: ${t.function.description}`).join('\n');
            setMessages(prev => [...prev, { id: 'user-' + Date.now(), role: 'user', content: '/tools' }, { id: 'sys-' + Date.now(), role: 'system', content: `Available Tools:\n${toolList}` }]);
            return;
        }
        if (lowerContent === '/about') {
            const aboutText = `VoidEx CLI v1.0.0\nBy VoidEx\nTelegram: https://t.me/voidex369\nGitHub: https://github.com/voidex369\nModel: ${currentConfig.model}`;
            setMessages(prev => [...prev, { id: 'user-' + Date.now(), role: 'user', content: '/about' }, { id: 'sys-' + Date.now(), role: 'system', content: aboutText }]);
            return;
        }
        if (lowerContent === '/help') {
            setMessages(prev => [...prev, { id: 'user-' + Date.now(), role: 'user', content: '/help' }, { id: 'sys-' + Date.now(), role: 'system', content: 'HELP_MENU_ACTIVE', name: 'help_menu' }]);
            return;
        }
        if (lowerContent === '/stats') {
            const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
            const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
            const stats = `System Stats:\n- CPU: ${os.cpus().length} Cores\n- RAM: ${freeMem}GB / ${totalMem}GB free\n- Current Model: ${currentConfig.model}`;
            setMessages(prev => [...prev, { id: 'user-' + Date.now(), role: 'user', content: '/stats' }, { id: 'sys-' + Date.now(), role: 'system', content: stats }]);
            return;
        }

        const userMsg: Message = { id: 'user-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7), role: 'user', content: truncateForRAM(content) };

        // 1. KILL ANY EXISTING PROCESS AND REQUEST
        stopLoading();

        // 2. START NEW REQUEST
        const requestId = currentRequestIdRef.current;
        abortController.current = new AbortController();
        const signal = abortController.current.signal;

        // Use REF to get current messages
        let currentMsgs = [...messagesRef.current, userMsg];

        setMessages(currentMsgs);
        setIsLoading(true);
        setError(null);
        setAgentStatus('Thinking...');

        const callWithRetry = async (fn: () => Promise<any>, retries = 3, delay = 2000): Promise<any> => {
            try {
                if (signal.aborted) throw new Error('AbortError');
                return await fn();
            } catch (err: any) {
                if (signal.aborted) throw err;
                if ((err.message.includes('429') || err.message.includes('fetch failed')) && retries > 0) {
                    setAgentStatus(`Connection unstable. Retrying in ${delay / 1000}s... (${retries} left)`);
                    await new Promise(res => setTimeout(res, delay));
                    return callWithRetry(fn, retries - 1, delay * 2);
                }
                throw err;
            }
        };

        try {
            const client = createClient(latestApiKey!);

            // --- PINNED CONTEXT (Initial) ---
            const firstUserIdx = currentMsgs.findIndex(m => m.role === 'user');
            const firstUserMsg = firstUserIdx !== -1 ? currentMsgs[firstUserIdx] : null;

            const windowSize = 30;
            let recentMessages = currentMsgs.slice(-windowSize);
            if (firstUserMsg && !recentMessages.find(m => m.id === firstUserMsg.id)) {
                recentMessages = [firstUserMsg, ...recentMessages];
            }

            const completionFn = () => client.chat.completions.create({
                model: currentConfig.model,
                messages: [
                    { role: 'system', content: getSovereignPrompt() },
                    ...recentMessages
                        .filter(m => {
                            if (m.role === 'system' && ['welcome_msg', 'help_menu', 'tools_list'].includes(m.name || '')) return false;
                            // Filter out empty assistant messages that don't have tool calls
                            if (m.role === 'assistant' && !m.content?.trim() && (!m.tool_calls || m.tool_calls.length === 0)) return false;
                            return true;
                        })
                        .map(m => {
                            const role = (m.role === 'system' || m.role === 'tool') ? m.role : m.role;
                            // Ensure content is trimmed to stop AI mirroring whitespaces
                            const msg: any = { role, content: (m.content || '').trim() };
                            if (m.role === 'assistant' && m.tool_calls) msg.tool_calls = m.tool_calls;
                            if (m.role === 'tool') msg.tool_call_id = m.tool_call_id;
                            return msg;
                        })
                ],
                tools: toolsDefinition as any,
                stream: true,
            }, { signal });

            const stream = await callWithRetry(completionFn);
            if (requestId === currentRequestIdRef.current) {
                await processStream(stream, currentMsgs, client, currentConfig, 0, signal, requestId);
            }
        } catch (err: any) {
            if (err.name === 'AbortError' || requestId !== currentRequestIdRef.current) {
                // Ignore stale results
                return;
            } else if (err.message.includes('429')) {
                setError('Rate limit consistently hit (429). Try again later or use a different model.');
            } else if (err.message.includes('context_length_exceeded') || err.code === 'context_length_exceeded') {
                setError('Context limit exceeded. Use /clear to start fresh.');
            } else {
                setError(`Error: ${err.message || 'Unknown network error'}`);
            }
        } finally {
            if (requestId === currentRequestIdRef.current) {
                setIsLoading(false);
                setAgentStatus(null);
                abortController.current = null;
            }
        }
    }, [stopLoading]);

    const forgetMessages = useCallback((count: number) => {
        setMessages(prev => {
            const userIndices: number[] = [];
            prev.forEach((m, i) => { if (m.role === 'user') userIndices.push(i); });
            if (userIndices.length === 0) return prev;
            const splitIdx = userIndices[Math.max(0, userIndices.length - count)];
            const nextMsgs = prev.slice(0, splitIdx);
            shadowMessages = nextMsgs;
            return nextMsgs;
        });
    }, []);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        agentStatus,
        clearMessages: () => { setMessages([{ id: 'welcome', role: 'system', name: 'welcome_msg', content: '' }]); shadowMessages = []; },
        activeDialog,
        setActiveDialog,
        getAvailableModels,
        saveModel,
        saveApiKey,
        apiKey: getApiKey() || currentApiKey,
        stopLoading,
        hasMemory: fs.existsSync(path.join(os.homedir(), '.voidex-cli', 'memory.md')),
        pendingApproval,
        resolveApproval: (choice: 'allow' | 'deny' | 'always') => {
            if (approvalResolver.current) approvalResolver.current(choice);
        },
        liveToolOutput,
        history,
        setHistory,
        forgetMessages
    };
}
