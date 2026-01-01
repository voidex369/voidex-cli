import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { Message } from '../../types/index.js';
import { useTheme } from '../contexts/ThemeContext.js';

// --- Sub-components (Memoized for Stability) ---

export const HelpMenu = React.memo(() => {
    const { theme } = useTheme();
    return (
        <Box flexDirection="column" borderStyle="double" borderColor={theme.text.accent} padding={1} marginBottom={1}>
            <Text bold color={theme.text.accent}>Basics:</Text>
            <Text> Add context: Use @ to specify files for context (Coming Soon)</Text>
            <Text> Shell mode: Use natural language or execute bash directly via tools.</Text>

            <Box marginTop={1} flexDirection="column">
                <Text bold color={theme.text.accent}>Commands:</Text>
                <Text>  /about          - Show version info</Text>
                <Text>  /clear          - Clear screen and conversation history</Text>
                <Text>  /help           - Show this help menu</Text>
                <Text>  /model          - Configure LLM model</Text>
                <Text>  /stats          - Check system stats (RAM, CPU, etc)</Text>
                <Text>  /tools          - List available Sovereign tools</Text>
                <Text>  /auth           - Update API Key (Get at: https://openrouter.ai/keys)</Text>
                <Text bold color="green">  /chat           - Manage conversation history</Text>
                <Text>    save {'<id>'}   - Save current session as checkpoint</Text>
                <Text>    resume {'<id>'} - Resume session from checkpoint</Text>
                <Text>    list          - List all saved sessions</Text>
                <Text>    delete {'<id>'} - Delete a session checkpoint</Text>
                <Text>    share {'<file>'} - Share chat to file (.json or .txt)</Text>
            </Box>

            <Box marginTop={1} flexDirection="column">
                <Text bold color="yellow">Keyboard Shortcuts:</Text>
                <Text> Ctrl+C      - Quit (or Cancel Thinking)</Text>
                <Text> Tab         - Autocomplete suggestion</Text>
                <Text> Up/Down     - Cycle history or suggestions</Text>
                <Text> Enter       - Send message</Text>
            </Box>

            <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="white">
                <Text bold color="white">By VoidEx</Text>
                <Text> Telegram: https://t.me/voidex369</Text>
                <Text> GitHub:   https://github.com/voidex369</Text>
            </Box>
        </Box>
    );
});

export const ToolsList = React.memo(({ content }: { content: string }) => {
    const { theme } = useTheme();
    const tools = content.replace('Available Tools:\n', '').split('\n');
    return (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.status.success} padding={1} marginBottom={1}>
            <Text bold color={theme.status.success}>Available Sovereign Tools:</Text>
            {tools.map((t, i) => (
                <Text key={i} color={theme.text.primary}>  {t}</Text>
            ))}
        </Box>
    );
});

export const WelcomeBox = React.memo(() => {
    const { theme } = useTheme();
    return (
        <Box flexDirection="column" marginBottom={1}>
            <Gradient name="pastel">
                <Text bold>VoidEx CLI | By VoidEx 🏴☠️</Text>
            </Gradient>
            <Box flexDirection="column" borderStyle="round" borderColor={theme.text.accent} padding={1} marginTop={1}>
                <Text color={theme.text.primary}>By VoidEx | Telegram: https://t.me/voidex369</Text>
                <Box marginTop={1}>
                    <Text color={theme.text.primary}>Type <Text color={theme.status.warning}>/help</Text> to see available commands.</Text>
                </Box>
            </Box>
        </Box>
    );
});

export const TruncatedResultBox = React.memo(({ content, isSuccess }: { content: string, isSuccess: boolean }) => {
    const { theme } = useTheme();
    if (!content) return <Text dimColor>(no output)</Text>;

    const RENDER_LIMIT = 10000;
    if (content.length > RENDER_LIMIT) {
        return (
            <Box flexDirection="column">
                <Text dimColor>{content.slice(0, 1000)} ...</Text>
                <Box marginY={1} paddingX={1} borderStyle="single" borderColor={theme.status.error}>
                    <Text bold color={theme.status.error}>⚠ LARGE OUTPUT ({Math.round(content.length / 1024)} KB)</Text>
                    <Text color={theme.status.warning}>Memory protected. Full output truncated in terminal.</Text>
                </Box>
            </Box>
        );
    }

    const lines = content.split('\n');
    const MAX_LINES = 15;
    if (lines.length <= MAX_LINES) return <Text dimColor>{content}</Text>;

    const first7 = lines.slice(0, 7);
    const last7 = lines.slice(-7);
    const hidden = lines.length - 14;

    return (
        <Box flexDirection="column">
            {first7.map((l, i) => <Text key={`f-${i}`} dimColor>{l}</Text>)}
            <Box marginY={1} paddingX={1} borderStyle="single" borderColor={theme.ui.comment}>
                <Text italic color={theme.status.warning}>... [ {hidden} lines hidden for stability ] ...</Text>
            </Box>
            {last7.map((l, i) => <Text key={`l-${i}`} dimColor>{l}</Text>)}
        </Box>
    );
});


export const MessageItem = React.memo(({ msg }: { msg: Message }) => {
    const { theme } = useTheme();
    const boxProps = { flexDirection: "column" as const, marginBottom: 1, flexShrink: 0 };

    if (msg.role === 'system') {
        if (msg.name === 'welcome_msg') return <WelcomeBox />;
        if (msg.name === 'help_menu') return <HelpMenu />;
        if (msg.name === 'tools_list') return <ToolsList content={msg.content || ''} />;
        return <Box paddingX={1} marginBottom={1} flexShrink={0}><Text color={theme.ui.comment} italic>✦ {msg.content}</Text></Box>;
    }

    if (msg.role === 'tool') {
        const isSuccess = !msg.content?.toLowerCase().includes('error') && !msg.content?.toLowerCase().includes('failed');
        const color = isSuccess ? theme.status.success : theme.status.error;
        return (
            <Box {...boxProps} marginLeft={2} borderStyle="round" borderColor={color} paddingX={1}>
                <Text bold color={color}>{isSuccess ? '✓' : '✖'} Tool Result:</Text>
                <TruncatedResultBox content={msg.content || ''} isSuccess={isSuccess} />
            </Box>
        );
    }

    if (msg.role === 'assistant') {
        const hasTools = msg.tool_calls && msg.tool_calls.length > 0;
        return (
            <Box {...boxProps}>
                <Text bold color={theme.text.accent}>Agent:</Text>
                {msg.content && (
                    <Box paddingLeft={2} marginBottom={hasTools ? 1 : 0}>
                        <Text color={theme.text.response || theme.text.primary} >{msg.content}</Text>
                    </Box>
                )}
                {hasTools && msg.tool_calls!.map((tc: any, idx: number) => {
                    let formattedArgs = tc.function.arguments;
                    if (formattedArgs.length > 50) {
                        try {
                            const parsed = JSON.parse(tc.function.arguments);
                            if (parsed.content && parsed.content.length > 100) {
                                parsed.content = parsed.content.substring(0, 100) + '...';
                            }
                            formattedArgs = JSON.stringify(parsed, null, 2);
                        } catch (e) {
                            if (formattedArgs.length > 150) formattedArgs = formattedArgs.slice(0, 150) + '...';
                        }
                    }

                    return (
                        <Box key={idx} flexDirection="column" borderStyle="round" borderColor={theme.text.accent} paddingX={1} marginTop={idx === 0 ? 0 : 1}>
                            <Text bold color={theme.text.accent}>⚙ Tool Call: {tc.function.name}</Text>
                            <Box paddingLeft={1}><Text dimColor italic>{formattedArgs}</Text></Box>
                        </Box>
                    );
                })}
            </Box>
        );
    }

    return (
        <Box {...boxProps} borderStyle="round" borderColor={theme.border.focused} paddingX={1}>
            <Text bold color={theme.text.link}>👤 You:</Text>
            <Text color={theme.text.primary}>{msg.content}</Text>
        </Box>
    );
});
