import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { useChat } from '../hooks/useChat.js';
import { getAvailableModels, saveModel, saveApiKey, getApiKey, getModelDisplayName } from '../../lib/config.js';
import { useTheme } from '../contexts/ThemeContext.js';
import HistoryViewport from './HistoryViewport.js';
import StatusArea from './StatusArea.js';
import InputArea from './InputArea.js';

// --- INLINE DIALOG COMPONENTS ---

const ModelPicker = React.memo(({ onSelect, onCancel, models }: any) => {
    const [filter, setFilter] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const filtered = useMemo(() => models.filter((m: string) => m.toLowerCase().includes(filter.toLowerCase())), [filter, models]);

    // Pagination Logic
    const visibleCount = 10;
    const totalCount = filtered.length;
    const startIndex = Math.floor(selectedIndex / visibleCount) * visibleCount;
    const visible = useMemo(() => filtered.slice(startIndex, startIndex + visibleCount), [filtered, startIndex]);

    useInput((input, key) => {
        if (totalCount === 0) { if (key.escape || (key.ctrl && input === 'c')) onCancel(); return; }
        if (key.upArrow) setSelectedIndex(p => (p > 0 ? p - 1 : totalCount - 1));
        else if (key.downArrow) setSelectedIndex(p => (p < totalCount - 1 ? p + 1 : 0));
        else if (key.return) { if (filtered[selectedIndex]) onSelect(filtered[selectedIndex]); }
        else if (key.escape || (key.ctrl && input === 'c')) onCancel();
    });

    return (
        <Box flexDirection="column" borderStyle="double" borderColor="magenta" padding={1} width={80}>
            <Text bold color="magenta">Select Model (Esc to cancel):</Text>
            <Box borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}><TextInput value={filter} onChange={setFilter} placeholder="Search..." /></Box>
            <Box flexDirection="column">{visible.map((m: string, i: number) => {
                const isSel = (startIndex + i) === selectedIndex;
                return <Text key={m} color={isSel ? 'cyan' : 'white'} bold={isSel}>{isSel ? '➤ ' : '  '}{getModelDisplayName(m)}</Text>;
            })}</Box>
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
        <Box flexDirection="column" borderStyle="double" borderColor={theme.text.accent} padding={1} width={80}>
            <Text bold color={theme.text.accent}>Select Theme:</Text>
            {availableThemes.map((t, i) => <Text key={t} color={i === selectedIndex ? theme.status.success : theme.text.primary}>{i === selectedIndex ? '➤ ' : '  '}{t}</Text>)}
        </Box>
    );
});

const AuthDialog = React.memo(({ onSave, onCancel, currentKey }: any) => {
    const [key, setKey] = useState('');

    useInput((input, keyData) => {
        if (keyData.escape) onCancel();
        if (keyData.ctrl && input.toLowerCase() === 'c') onCancel();
    });

    // Logic buat sensor API Key biar aman
    const maskedKey = currentKey && currentKey.length > 10
        ? currentKey.substring(0, 8) + '...' + currentKey.substring(currentKey.length - 4)
        : (currentKey ? '********' : 'None');

    return (
        <Box flexDirection="column" borderStyle="double" borderColor="yellow" padding={1} width={80}>
            <Text bold color="yellow">Update API Key (Esc to cancel):</Text>

            <Box marginTop={1} paddingX={1} borderStyle="single" borderColor="gray">
                <Text dimColor>Current: <Text color="white" bold>{maskedKey}</Text></Text>
            </Box>

            <Box borderStyle="single" borderColor="white" paddingX={1} marginTop={1}>
                <TextInput
                    value={key}
                    onChange={setKey}
                    onSubmit={onSave}
                    placeholder="Paste new API Key here..."
                    focus={true}
                    mask="*"
                />
            </Box>

            <Box marginTop={1}>
                <Text dimColor italic>Get your keys at: <Text color="cyan" bold underline>https://openrouter.ai/keys</Text></Text>
            </Box>
            <Box marginTop={0}>
                <Text dimColor italic>New key will replace the old one. Leave empty to keep current.</Text>
            </Box>
        </Box>
    );
});

// --- MAIN CHAT LOGIC ---

const ChatView = React.memo(({ onDialog, chatState, isFullScreen }: any) => {
    const {
        messages, isLoading, error, sendMessage, agentStatus, stopLoading,
        hasMemory, pendingApproval, resolveApproval, liveToolOutput,
        history, setHistory, forgetMessages
    } = chatState;
    const { exit } = useApp();

    // State UI
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [selIdx, setSelIdx] = useState(0);
    const [apprIdx, setApprIdx] = useState(0);
    const [histIdx, setHistIdx] = useState(-1);

    // [FIX] State untuk memaksa kursor pindah ke ujung
    const [inputResetKey, setInputResetKey] = useState(0);

    // [SECURITY] State untuk input kode konfirmasi Nuclear
    const [nuclearCodeInput, setNuclearCodeInput] = useState('');

    const [showExitNotice, setShowExitNotice] = useState(false);
    const lastCtrlCTime = useRef(0);

    const apprOpts = useMemo(() => [{ label: 'Allow once', value: 'allow' }, { label: 'Always', value: 'always' }, { label: 'Deny', value: 'deny' }], []);

    // 1. SMART SUGGESTION LOGIC
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
            { cmd: '/forget', desc: 'Forget last N interactions' },
            { cmd: '/exit', desc: 'Quit application' }
        ];

        if (input.startsWith('/')) {
            const parents = allCmds.filter(c => !c.parent);
            const activeParent = parents.find(p => input === p.cmd || input.startsWith(p.cmd + ' '));

            const filtered = allCmds.filter(c => {
                if (activeParent) {
                    return c.parent === activeParent.cmd && c.cmd.startsWith(input) && c.cmd !== input;
                }
                return !c.parent && c.cmd.startsWith(input) && c.cmd !== input;
            });
            setSuggestions(filtered);
        } else {
            setSuggestions([]);
        }
        setSelIdx(0);
    }, [input]);

    // 2. Global Input Handler (Controller)
    useInput((inputChars, key) => {
        // A. Approval Mode
        if (pendingApproval) {
            // [LOGIC NUCLEAR TIER]
            if (pendingApproval.riskLevel === 'critical' && pendingApproval.challengeCode) {
                // Cancel
                if (key.escape || (key.ctrl && inputChars === 'c')) {
                    resolveApproval('deny');
                    setNuclearCodeInput('');
                    return;
                }

                // Backspace
                if (key.delete || key.backspace) {
                    setNuclearCodeInput(prev => prev.slice(0, -1));
                    return;
                }

                // Input Alphanumeric Check
                if (inputChars && inputChars.length === 1 && /^[a-zA-Z0-9]$/.test(inputChars)) {
                    const nextCode = nuclearCodeInput + inputChars;
                    setNuclearCodeInput(nextCode);

                    // Auto-confirm jika kode cocok
                    if (nextCode === pendingApproval.challengeCode) {
                        setTimeout(() => {
                            resolveApproval('allow');
                            setNuclearCodeInput('');
                        }, 200);
                    }
                }
                return; // Stop processing arrow keys in Nuclear Mode
            }

            // [LOGIC CAUTION TIER] (Normal Approval)
            if (key.upArrow) setApprIdx(p => (p > 0 ? p - 1 : apprOpts.length - 1));
            else if (key.downArrow) setApprIdx(p => (p < apprOpts.length - 1 ? p + 1 : 0));
            else if (key.return) resolveApproval(apprOpts[apprIdx].value as any);
            return;
        }

        // B. Ctrl+C Handler
        if (key.ctrl && inputChars === 'c') {
            if (isLoading) {
                stopLoading();
            } else {
                const now = Date.now();
                if (now - lastCtrlCTime.current < 2000) exit();
                else {
                    lastCtrlCTime.current = now;
                    setShowExitNotice(true);
                    setTimeout(() => setShowExitNotice(false), 2000);
                }
            }
            return;
        }

        // C. Suggestion Navigation
        if (suggestions.length > 0) {
            if (key.tab && suggestions[selIdx]) {
                const selectedCmd = suggestions[selIdx].cmd;
                const isParent = ['/chat', '/stats', '/tools'].includes(selectedCmd);

                setInput(selectedCmd + (isParent ? ' ' : ' '));
                setInputResetKey(prev => prev + 1); // Reset cursor to end

                setSuggestions([]);
            } else if (key.upArrow) setSelIdx(p => (p > 0 ? p - 1 : suggestions.length - 1));
            else if (key.downArrow) setSelIdx(p => (p < suggestions.length - 1 ? p + 1 : 0));
            return;
        }

        // D. History Navigation
        if (key.upArrow && !key.shift) {
            setHistIdx(prev => {
                const newIdx = Math.min(prev + 1, history.length - 1);
                if (newIdx !== prev && newIdx >= 0) {
                    setInput(history[history.length - 1 - newIdx]);
                    setInputResetKey(prev => prev + 1); // Reset cursor to end
                }
                return newIdx;
            });
        } else if (key.downArrow && !key.shift) {
            setHistIdx(prev => {
                const newIdx = Math.max(prev - 1, -1);
                if (newIdx === -1) {
                    setInput('');
                } else if (newIdx !== prev) {
                    setInput(history[history.length - 1 - newIdx]);
                    setInputResetKey(prev => prev + 1); // Reset cursor to end
                }
                return newIdx;
            });
        }
    });

    // 3. Send Handler
    const handleSend = useCallback((v: string) => {
        const trimmed = v.trim();
        if (!trimmed) return;

        if (trimmed === '/model' || trimmed === '/auth' || trimmed === '/theme') {
            onDialog(trimmed.slice(1));
            setInput(''); return;
        }
        if (trimmed.startsWith('/forget')) {
            forgetMessages(parseInt(trimmed.split(' ')[1]) || 1);
            setInput(''); return;
        }
        if (trimmed === '/exit') { exit(); return; }

        sendMessage(trimmed);
        setHistory((prev: string[]) => {
            const last = prev[prev.length - 1];
            return last === trimmed ? prev : [...prev, trimmed];
        });
        setHistIdx(-1);
        setInput('');
    }, [sendMessage, onDialog, exit, forgetMessages, setHistory]);

    return (
        <Box flexDirection="column" width="100%" height={isFullScreen ? '100%' : undefined}>
            {/* --- TOP: HISTORY (STATIC) --- */}
            <Box flexGrow={isFullScreen ? 1 : 0} minHeight={0} width="100%">
                <HistoryViewport messages={messages} isLoading={isLoading} />
            </Box>

            {/* --- BOTTOM: ACTIVE AREA --- */}
            <Box flexDirection="column" marginTop={0} flexGrow={0} flexShrink={0} width="100%">

                {(showExitNotice || error) && (
                    <Box paddingX={1}><Text color={showExitNotice ? "yellow" : "red"} bold>{showExitNotice ? "⚠ Press Ctrl+C again to exit" : `✖ Error: ${error}`}</Text></Box>
                )}

                <StatusArea
                    agentStatus={agentStatus}
                    liveToolOutput={liveToolOutput}
                    pendingApproval={pendingApproval}
                    approvalOptions={apprOpts}
                    approvalIndex={apprIdx}
                    userInputCode={nuclearCodeInput} // Pass nuclear code ke tampilan
                />

                <InputArea
                    input={input}
                    setInput={setInput}
                    onSubmit={handleSend}
                    suggestions={suggestions}
                    selectedIndex={selIdx}
                    hasMemory={hasMemory}
                    isLoading={isLoading}
                    resetKey={inputResetKey} // Pass reset trigger
                />
            </Box>
        </Box>
    );
});

export default function Chat({ isFullScreen }: { isFullScreen: boolean }) {
    const chatState = useChat();
    const [dialog, setDialog] = useState<null | 'model' | 'auth' | 'theme'>(null);
    const models = useMemo(() => getAvailableModels(), []);
    const { setTheme } = useTheme();

    const handleModelSelect = (m: string) => { saveModel(m); setDialog(null); chatState.sendMessage(`SYSTEM_MODEL_CHANGED:${m}`); };
    const handleAuthSave = (k: string) => { if (k.trim()) { saveApiKey(k.trim()); chatState.sendMessage(`SYSTEM_AUTH_CHANGED:OK`); } setDialog(null); };

    if (dialog === 'model') return <Box padding={2}><ModelPicker models={models} onSelect={handleModelSelect} onCancel={() => setDialog(null)} /></Box>;
    if (dialog === 'theme') return <Box padding={2}><ThemePicker onSelect={(t: string) => { setTheme(t); setDialog(null); }} onCancel={() => setDialog(null)} /></Box>;
    if (dialog === 'auth') return <Box padding={2}><AuthDialog currentKey={getApiKey() || ''} onSave={handleAuthSave} onCancel={() => setDialog(null)} /></Box>;

    return <ChatView onDialog={setDialog} chatState={chatState} isFullScreen={isFullScreen} />;
}