import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp, Static } from 'ink';
import TextInput from 'ink-text-input';
import Gradient from 'ink-gradient';
import { useChat } from '../hooks/useChat.js';
import { Message } from '../../types/index.js';
import { getAvailableModels, saveModel, saveApiKey, getApiKey, getModelDisplayName } from '../../lib/config.js';
import { useTheme } from '../contexts/ThemeContext.js';
import { HistoryViewport } from './HistoryViewport.js';

// --- Sub-components (Memoized for Stability) ---

// --- Sub-components moved to MessageItem.tsx ---

const ModelPicker = React.memo(({ onSelect, onCancel, models }: any) => {
    const [filter, setFilter] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filtered = useMemo(() => models.filter((m: string) => m.toLowerCase().includes(filter.toLowerCase())), [filter, models]);

    const visibleCount = 10;
    const totalCount = filtered.length;
    const startIndex = Math.floor(selectedIndex / visibleCount) * visibleCount;
    const visible = useMemo(() => filtered.slice(startIndex, startIndex + visibleCount), [filtered, startIndex]);

    useInput((input, key) => {
        if (totalCount === 0) {
            if (key.escape || (key.ctrl && input === 'c')) onCancel();
            return;
        }

        if (key.upArrow) setSelectedIndex(p => (p > 0 ? p - 1 : totalCount - 1));
        else if (key.downArrow) setSelectedIndex(p => (p < totalCount - 1 ? p + 1 : 0));
        else if (key.pageUp) setSelectedIndex(p => Math.max(0, p - 10));
        else if (key.pageDown) setSelectedIndex(p => Math.min(totalCount - 1, p + 10));
        else if (key.return) { if (filtered[selectedIndex]) onSelect(filtered[selectedIndex]); }
        else if (key.escape || (key.ctrl && input === 'c')) onCancel();
    });

    return (
        <Box flexDirection="column" borderStyle="double" borderColor="magenta" padding={1} width={80} flexShrink={0}>
            <Text bold color="magenta">Select Model (Esc to cancel):</Text>

            <Box borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1} flexShrink={0}>
                <TextInput value={filter} onChange={(v) => { setFilter(v); setSelectedIndex(0); }} placeholder="Search models..." />
            </Box>

            <Box flexDirection="column" flexShrink={0}>
                {visible.map((m: string, i: number) => {
                    const absIdx = startIndex + i;
                    const isSel = absIdx === selectedIndex;
                    const displayName = getModelDisplayName(m);
                    const safeName = displayName.length > 70 ? displayName.slice(0, 67) + '...' : displayName;

                    return (
                        <Text key={`${m}-${absIdx}`} color={isSel ? 'cyan' : 'white'} bold={isSel} wrap="truncate">
                            {isSel ? '➤ ' : '  '}{safeName}
                        </Text>
                    );
                })}
            </Box>

            <Box marginTop={1} paddingX={1} borderStyle="single" borderColor="gray" flexShrink={0}>
                <Text dimColor>
                    Found: {totalCount} | Page: {Math.floor(startIndex / visibleCount) + 1} of {Math.max(1, Math.ceil(totalCount / visibleCount))}
                </Text>
            </Box>
        </Box>
    );
});

const ThemePicker = React.memo(({ onSelect, onCancel }: any) => {
    const { availableThemes, theme } = useTheme();
    const [selectedIndex, setSelectedIndex] = useState(0);

    useInput((input, key) => {
        if (key.upArrow) setSelectedIndex(p => (p > 0 ? p - 1 : availableThemes.length - 1));
        else if (key.downArrow) setSelectedIndex(p => (p < availableThemes.length - 1 ? p + 1 : 0));
        else if (key.return) onSelect(availableThemes[selectedIndex]);
        else if (key.escape || (key.ctrl && input === 'c')) onCancel();
    });

    return (
        <Box flexDirection="column" borderStyle="double" borderColor={theme.text.accent} padding={1} width={80} flexShrink={0}>
            <Text bold color={theme.text.accent}>Select Theme (Esc to cancel):</Text>
            <Box flexDirection="column" marginTop={1}>
                {availableThemes.map((t, i) => (
                    <Text key={t} color={i === selectedIndex ? theme.status.success : theme.text.primary} bold={i === selectedIndex}>
                        {i === selectedIndex ? '➤ ' : '  '}{t}
                    </Text>
                ))}
            </Box>
        </Box>
    );
});

const AuthDialog = React.memo(({ onSave, onCancel, currentKey }: any) => {
    const [key, setKey] = useState('');

    useInput((input, keyData) => {
        if (keyData.escape) onCancel();
        if (keyData.ctrl && input.toLowerCase() === 'c') onCancel();
    });

    const maskedKey = currentKey ? currentKey.substring(0, 8) + '...' + currentKey.substring(currentKey.length - 4) : 'None';

    return (
        <Box flexDirection="column" borderStyle="double" borderColor="yellow" padding={1} width={80}>
            <Text bold color="yellow">Update API Key (Esc to cancel):</Text>
            <Box marginTop={1} paddingX={1} borderStyle="single" borderColor="gray">
                <Text dimColor>Current: <Text color="white" bold>{maskedKey}</Text></Text>
            </Box>
            <Box borderStyle="single" borderColor="white" paddingX={1} marginTop={1}>
                <TextInput value={key} onChange={setKey} onSubmit={onSave} placeholder="Paste new API Key here..." focus={true} />
            </Box>
            <Box marginTop={1}><Text dimColor italic>Get your keys at: <Text color="cyan" bold underline>https://openrouter.ai/keys</Text></Text></Box>
            <Box marginTop={1}><Text dimColor italic>New key will replace the old one. Leave empty to keep current.</Text></Box>
        </Box>
    );
});

const StatusArea = React.memo(({ agentStatus, liveToolOutput, pendingApproval, approvalOptions, approvalIndex }: any) => {
    if (!agentStatus && !pendingApproval) return null;

    // Fixed display limit for live output to prevent height trashing
    const MAX_LIVE_LINES = 8;

    const cappedOutput = useMemo(() => {
        if (!liveToolOutput) return '';
        const lines = liveToolOutput.split('\n').map((l: string) => l.length > 100 ? l.slice(0, 97) + '...' : l);
        // Only show last N lines to keep height stable
        if (lines.length > MAX_LIVE_LINES) {
            return '...\n' + lines.slice(-MAX_LIVE_LINES).join('\n');
        }
        return lines.join('\n');
    }, [liveToolOutput]);

    return (
        <Box flexDirection="column" flexGrow={0} flexShrink={0} marginBottom={1} borderStyle="single" borderColor="yellow" paddingX={1} width="100%">
            {agentStatus && (
                <Box flexDirection="column" width="100%">
                    <Box width="100%"><Text color="yellow">⏳</Text><Text bold> {agentStatus}</Text></Box>
                    {/* [FIX] Ensure output area has minimum height if content exists, to reduce layout shift */}
                    {cappedOutput ? (
                        <Box marginTop={1} flexDirection="column" width="100%">
                            <Text color="gray">{cappedOutput}</Text>
                        </Box>
                    ) : null}
                </Box>
            )}
            {pendingApproval && (
                <Box flexDirection="column" marginTop={1} width="100%">
                    <Text bold color="yellow">⚠ Safety Check: {pendingApproval.name}</Text>
                    <Box flexDirection="column" marginTop={1} marginLeft={1} width="100%">
                        {approvalOptions.map((opt: any, i: number) => (
                            <Text key={opt.value} color={i === approvalIndex ? 'cyan' : 'white'} bold={i === approvalIndex}>
                                {i === approvalIndex ? '●' : ' '} {opt.label}
                            </Text>
                        ))}
                    </Box>
                </Box>
            )}
        </Box>
    );
});

const InputArea = React.memo(({ input, setInput, handleSend, suggestions, selectedIndex, hasMemory }: any) => (
    <Box flexDirection="column" flexShrink={0} flexGrow={0} width="100%">
        {suggestions.length > 0 && (
            <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1} width="100%">
                {suggestions.map((s: any, i: number) => (
                    <Box key={s.cmd} flexDirection="row" width="100%">
                        <Text color={i === selectedIndex ? 'cyan' : 'white'} bold={i === selectedIndex}>
                            {i === selectedIndex ? '> ' : '  '}{s.cmd}
                        </Text>
                        <Text dimColor> - {s.desc}</Text>
                    </Box>
                ))}
            </Box>
        )}

        {/* [FIX] Box Input dengan layout yang diminta */}
        <Box borderStyle="single" borderColor="green" paddingX={1} flexDirection="column" width="100%">

            {/* Baris 1: Input */}
            <Box flexDirection="row" width="100%">
                <Box marginRight={1}><Text bold color="green">❯</Text></Box>
                <Box flexGrow={1} minHeight={1}>
                    <TextInput value={input} onChange={setInput} placeholder="Type or / for commands..." />
                </Box>
            </Box>

            {/* Baris 2: Status Memory (Dengan Jarak) */}
            {hasMemory && (
                <Box marginTop={1} width="100%">
                    {/* Dihapus 'size' prop yang error, ditambah marginTop=1 untuk spasi kosong */}
                    <Text dimColor italic>└─ Sovereign memory active</Text>
                </Box>
            )}
        </Box>
    </Box>
));

// HistoryViewport is now imported

const ChatView = React.memo(({ onDialog, chatState, isFullScreen }: any) => {
    const {
        messages, isLoading, error, sendMessage, agentStatus, stopLoading,
        hasMemory, pendingApproval, resolveApproval, liveToolOutput,
        history, setHistory, forgetMessages
    } = chatState;
    const { exit } = useApp();
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [selIdx, setSelIdx] = useState(0);
    const [apprIdx, setApprIdx] = useState(0);
    const apprOpts = useMemo(() => [{ label: 'Allow once', value: 'allow' }, { label: 'Always', value: 'always' }, { label: 'Deny', value: 'deny' }], []);

    const [histIdx, setHistIdx] = useState(-1);
    const lastCtrlCTime = useRef(0);
    const [showExitNotice, setShowExitNotice] = useState(false);

    const isTTY = process.stdout.isTTY;

    useEffect(() => {
        const allCmds = [
            { cmd: '/help', desc: 'Show help menu' },
            { cmd: '/tools', desc: 'List available tools...' },
            { cmd: '/tools desc', desc: 'List tools with descriptions', parent: '/tools' },
            { cmd: '/model', desc: 'Select AI model' },
            { cmd: '/theme', desc: 'Switch visual theme' },
            { cmd: '/clear', desc: 'Clear conversation' },
            { cmd: '/about', desc: 'Version info' },
            { cmd: '/stats', desc: 'System statistics...' },
            { cmd: '/stats session', desc: 'Session metrics', parent: '/stats' },
            { cmd: '/stats model', desc: 'Model metrics', parent: '/stats' },
            { cmd: '/auth', desc: 'Enter API Key' },
            { cmd: '/chat', desc: 'Session management...' },
            { cmd: '/chat save', desc: 'Save current session', parent: '/chat' },
            { cmd: '/chat resume', desc: 'Resume a session', parent: '/chat' },
            { cmd: '/chat list', desc: 'List saved sessions', parent: '/chat' },
            { cmd: '/chat delete', desc: 'Delete a session', parent: '/chat' },
            { cmd: '/chat share', desc: 'Share chat to file', parent: '/chat' },
            { cmd: '/forget', desc: 'Forget last N interactions' }
        ];

        if (input.startsWith('/')) {
            const isChatMode = input.startsWith('/chat');
            const isStatsMode = input.startsWith('/stats');
            const isToolsMode = input.startsWith('/tools');

            const filtered = allCmds.filter(c => {
                if (isChatMode) return c.parent === '/chat' && c.cmd.startsWith(input) && c.cmd !== input;
                if (isStatsMode) return c.parent === '/stats' && c.cmd.startsWith(input) && c.cmd !== input;
                if (isToolsMode) return c.parent === '/tools' && c.cmd.startsWith(input) && c.cmd !== input;
                return !c.parent && c.cmd.startsWith(input) && c.cmd !== input;
            });
            setSuggestions(filtered);
        } else {
            setSuggestions([]);
        }
        setSelIdx(0);
    }, [input]);

    useInput((inputChars, key) => {
        if (pendingApproval) {
            if (key.upArrow) setApprIdx(p => (p > 0 ? p - 1 : apprOpts.length - 1));
            else if (key.downArrow) setApprIdx(p => (p < apprOpts.length - 1 ? p + 1 : 0));
            else if (key.return) resolveApproval(apprOpts[apprIdx].value as any);
            return;
        }

        if (key.ctrl && inputChars === 'c') {
            if (isLoading) {
                stopLoading();
            } else {
                const now = Date.now();
                if (now - lastCtrlCTime.current < 2000) {
                    exit();
                } else {
                    lastCtrlCTime.current = now;
                    setShowExitNotice(true);
                    setTimeout(() => setShowExitNotice(false), 2000);
                }
            }
            return;
        }

        // --- Multi-line and Submission Logic ---
        const isEnter = key.return;

        // 1. Submit on Enter (No Shift, No Ctrl)
        if (isEnter && !key.shift && !key.ctrl && suggestions.length === 0) {
            handleSend(input);
            return;
        }

        // 2. Newline on Ctrl+J or Shift+Enter
        if ((key.ctrl && (inputChars === 'j' || inputChars === '\n')) || (isEnter && key.shift)) {
            setInput(prev => prev + '\n');
            return;
        }

        if (suggestions.length > 0) {
            if (key.tab && suggestions[selIdx]) {
                setInput(suggestions[selIdx].cmd + (suggestions[selIdx].cmd.endsWith(' ') ? '' : ' '));
                setSuggestions([]);
            }
            else if (key.upArrow) setSelIdx(p => (p > 0 ? p - 1 : suggestions.length - 1));
            else if (key.downArrow) setSelIdx(p => (p < suggestions.length - 1 ? p + 1 : 0));
            return;
        }

        if (key.upArrow && !key.shift) {
            setHistIdx(prev => {
                const newIdx = Math.min(prev + 1, history.length - 1);
                if (newIdx !== prev && newIdx >= 0) setInput(history[history.length - 1 - newIdx]);
                return newIdx;
            });
        }
        else if (key.downArrow && !key.shift) {
            setHistIdx(prev => {
                const newIdx = Math.max(prev - 1, -1);
                if (newIdx === -1) setInput('');
                else if (newIdx !== prev) setInput(history[history.length - 1 - newIdx]);
                return newIdx;
            });
        }
    });

    const handleSend = useCallback((v: string) => {
        const trimmed = v.trim().toLowerCase();
        if (trimmed === '/model' || trimmed === '/auth' || trimmed === '/theme') {
            onDialog(trimmed.slice(1));
            setInput('');
            return;
        }
        if (trimmed.startsWith('/forget')) {
            const count = parseInt(trimmed.split(' ')[1]) || 1;
            forgetMessages(count);
            setInput('');
            return;
        }
        if (v.trim()) {
            sendMessage(v);
            setHistory((prev: string[]) => {
                const last = prev[prev.length - 1];
                if (last === v) return prev;
                return [...prev, v];
            });
            setHistIdx(-1);
        }
        setInput('');
    }, [sendMessage, onDialog]);

    return (
        <Box flexDirection="column" width="100%" height={isFullScreen ? '100%' : undefined}>
            {/* New Virtualized History Viewport */}
            <Box flexGrow={isFullScreen ? 1 : 0} minHeight={0} width="100%">
                <HistoryViewport messages={messages} isFullScreen={isFullScreen} isLoading={isLoading} />
            </Box>

            {/* [FIX] Layout Stability Wrapper */}
            <Box flexDirection="column" marginTop={0} flexGrow={0} flexShrink={0} width="100%">

                {/* Error Notices */}
                {(showExitNotice || error) && (
                    <Box flexDirection="column" paddingX={1} marginBottom={0}>
                        {showExitNotice && <Text color="yellow" bold>⚠ Press Ctrl+C again to exit</Text>}
                        {error && <Text color="red" bold>✖ Error: {error}</Text>}
                    </Box>
                )}

                {/* Live Status */}
                {isTTY && (
                    <StatusArea
                        agentStatus={agentStatus}
                        liveToolOutput={liveToolOutput}
                        pendingApproval={pendingApproval}
                        approvalOptions={apprOpts}
                        approvalIndex={apprIdx}
                    />
                )}

                {/* Input Area */}
                <InputArea
                    input={input}
                    setInput={setInput}
                    handleSend={handleSend}
                    suggestions={suggestions}
                    selectedIndex={selIdx}
                    hasMemory={hasMemory}
                />
            </Box>
        </Box>
    );
});

export default function Chat({ isFullScreen }: { isFullScreen: boolean }) {
    const chatState = useChat();
    const { sendMessage } = chatState;
    const [dialog, setDialog] = useState<null | 'model' | 'auth' | 'theme'>(null);
    const models = useMemo(() => getAvailableModels(), []);
    const { setTheme } = useTheme();

    const handleModelSelect = useCallback((m: string) => {
        saveModel(m);
        setDialog(null);
        sendMessage(`SYSTEM_MODEL_CHANGED:${m}`);
    }, [sendMessage]);

    const handleAuthSave = useCallback((k: string) => {
        if (k.trim()) {
            saveApiKey(k.trim());
            sendMessage(`SYSTEM_AUTH_CHANGED:OK`);
        }
        setDialog(null);
    }, [sendMessage]);

    const closeDialog = useCallback(() => setDialog(null), []);

    if (dialog === 'model') return <Box padding={2}><ModelPicker models={models} onSelect={handleModelSelect} onCancel={closeDialog} /></Box>;
    if (dialog === 'theme') return <Box padding={2}><ThemePicker onSelect={(t: string) => { setTheme(t); setDialog(null); }} onCancel={closeDialog} /></Box>;
    if (dialog === 'auth') return <Box padding={2}><AuthDialog currentKey={getApiKey() || ''} onSave={handleAuthSave} onCancel={closeDialog} /></Box>;

    return <ChatView onDialog={setDialog} chatState={chatState} isFullScreen={isFullScreen} />;
}
