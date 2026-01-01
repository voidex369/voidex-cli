import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { getApiKey, saveConfig } from '../lib/config.js';
import TextInput from 'ink-text-input';
import Chat from './components/Chat.js';
import { KeypressProvider } from './contexts/KeypressContext.js';
import { MouseProvider } from './contexts/MouseContext.js';
import { ScrollProvider } from './contexts/ScrollProvider.js';
import { useAlternateBuffer } from './hooks/useAlternateBuffer.js';
import { ThemeProvider } from './contexts/ThemeContext.js';

type View = 'welcome' | 'chat' | 'auth';

export default function App() {
    const [view, setView] = useState<View>('welcome');
    const [apiKey, setApiKey] = useState('');

    // Enable alternate buffer only when we are in the main 'chat' view to keep clean transitions
    useAlternateBuffer(view === 'chat');

    useEffect(() => {
        // Simple View Logic
        if (getApiKey()) {
            setView('chat');
        } else {
            setTimeout(() => setView('auth'), 2000);
        }
    }, []);

    if (view === 'welcome') {
        return (
            <Box flexDirection="column" alignItems="center" justifyContent="center" height="100%">
                <Gradient name="morning">
                    <BigText text="VoidEx CLI" font="simple" />
                </Gradient>
                <Text>Initializing Sovereign Environment...</Text>
            </Box>
        );
    }

    if (view === 'auth') {
        return (
            <Box flexDirection="column" justifyContent="center" alignItems="center" height="100%">
                <Text bold color="cyan">WELCOME TO VOIDEX CLI</Text>
                <Text>Please enter your OpenRouter API Key to activate the Sovereign Agent:</Text>
                <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
                    <TextInput
                        value={apiKey}
                        onChange={setApiKey}
                        onSubmit={(key) => {
                            saveConfig({ apiKey: key });
                            setView('chat');
                        }}
                        mask="*"
                    />
                </Box>
                <Box marginTop={1}>
                    <Text dimColor>Your key is saved locally in ~/.voidex-cli/config.json</Text>
                </Box>
            </Box>
        )
    }

    return (
        <KeypressProvider>
            <MouseProvider mouseEventsEnabled={true}>
                <ThemeProvider>
                    <ScrollProvider>
                        <Box flexDirection="column" height="100%">
                            <Chat />
                        </Box>
                    </ScrollProvider>
                </ThemeProvider>
            </MouseProvider>
        </KeypressProvider>
    );
}
