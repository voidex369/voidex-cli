import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink'; // [FIX] Tambah useInput & useApp
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { getApiKey, saveApiKey } from '../lib/config.js';
import { validateApiKey } from '../lib/openrouter.js';
import TextInput from 'ink-text-input';
import Chat from './components/Chat.js';
import { KeypressProvider } from './contexts/KeypressContext.js';
import { MouseProvider } from './contexts/MouseContext.js';
import { ScrollProvider } from './contexts/ScrollProvider.js';
import { useAlternateBuffer } from './hooks/useAlternateBuffer.js';
import { ThemeProvider } from './contexts/ThemeContext.js';
import { useWindowSize } from './hooks/useWindowSize.js';

type View = 'welcome' | 'chat' | 'auth';

export default function App() {
    const { exit } = useApp(); // [BARU] Hook buat exit aplikasi
    const [view, setView] = useState<View>('welcome');
    const [apiKey, setApiKey] = useState('');

    const [bootStatus, setBootStatus] = useState('Initializing Sovereign Environment...');
    const [bootColor, setBootColor] = useState('gray');

    const { height } = useWindowSize();
    const isFullScreen = false;

    useAlternateBuffer(view === 'chat' && isFullScreen);

    // [BARU] GLOBAL EXIT HANDLER (Pintu Darurat)
    // Menangani Ctrl+C saat di halaman Welcome atau Auth
    useInput((input, key) => {
        if (view !== 'chat' && key.ctrl && input === 'c') {
            exit(); // Matikan aplikasi seketika
        }
    });

    useEffect(() => {
        const bootSequence = async () => {
            const key = getApiKey();

            if (!key) {
                setBootColor('yellow');
                setBootStatus('⚠ API Key not configured. Redirecting to Setup...');
                setTimeout(() => setView('auth'), 2000);
                return;
            }

            setBootColor('cyan');
            setBootStatus('↻ Verifying Neural Uplink (API Check)...');

            const isValid = await validateApiKey(key);

            if (isValid) {
                setBootColor('green');
                setBootStatus('✓ Access Granted. System Online.');
                setTimeout(() => setView('chat'), 800);
            } else {
                setBootColor('red');
                setBootStatus('✖ Connection Failed or Invalid Key! Redirecting...');
                setTimeout(() => setView('auth'), 2500);
            }
        };

        if (view === 'welcome') {
            bootSequence();
        }

    }, [view]);

    if (view === 'welcome') {
        return (
            <Box flexDirection="column" alignItems="center" justifyContent="center" height={height}>
                <Gradient name="morning">
                    <BigText text="VoidEx CLI" font="simple" />
                </Gradient>
                <Text color={bootColor} bold>{bootStatus}</Text>
                <Box marginTop={1}>
                    <Text dimColor>(Press Ctrl+C to exit)</Text>
                </Box>
            </Box>
        );
    }

    if (view === 'auth') {
        return (
            <Box flexDirection="column" justifyContent="center" alignItems="center" height={height}>
                <Text bold color="cyan">WELCOME TO VOIDEX CLI</Text>

                <Box marginBottom={1}>
                    <Text color="yellow">⚠ Authentication Required</Text>
                </Box>

                <Text>Please enter your OpenRouter API Key to activate the Sovereign Agent:</Text>

                <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
                    <TextInput
                        value={apiKey}
                        onChange={setApiKey}
                        onSubmit={(key) => {
                            saveApiKey(key);
                            setBootStatus('↻ Re-verifying Credentials...');
                            setBootColor('cyan');
                            setView('welcome');
                        }}
                        mask="*"
                        placeholder="sk-or-..."
                    />
                </Box>

                <Box marginTop={1}>
                    <Text dimColor>Your key will be saved securely in .env</Text>
                </Box>
                <Box marginTop={1}>
                    {/* Kasih tau user kalau mereka bisa keluar */}
                    <Text color="red" bold>Press Ctrl+C to Cancel/Exit</Text>
                </Box>
            </Box>
        )
    }

    return (
        <KeypressProvider>
            <MouseProvider mouseEventsEnabled={true}>
                <ThemeProvider>
                    <ScrollProvider>
                        <Box flexDirection="column" height={isFullScreen ? height : undefined}>
                            <Chat isFullScreen={isFullScreen} />
                        </Box>
                    </ScrollProvider>
                </ThemeProvider>
            </MouseProvider>
        </KeypressProvider>
    );
}