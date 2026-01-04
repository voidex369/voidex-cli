/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useMemo, useCallback } from 'react';
import { Box, Static, type DOMElement } from 'ink';
import { VirtualizedList, VirtualizedListRef } from './shared/VirtualizedList.js';
import MessageItem from './MessageItem.js'; // [FIX] Default Import
import { Message } from '../../types/index.js';
import { useWindowSize } from '../hooks/useWindowSize.js';

interface HistoryViewportProps {
    messages: Message[];
    isFullScreen?: boolean;
    isLoading?: boolean;
}

const HistoryViewport = React.memo(({ messages, isFullScreen = false, isLoading = false }: HistoryViewportProps) => {
    const listRef = useRef<VirtualizedListRef<Message>>(null);
    const containerRef = useRef<DOMElement>(null);

    const { width } = useWindowSize();
    const safeWidth = Math.max(20, width - 5);

    // Initial estimation callback for VirtualizedList
    const estimatedItemHeight = useMemo(() => {
        return (index: number) => {
            const msg = messages[index];
            if (!msg) return 3;
            const contentLines = Math.max(1, (msg.content?.length || 0) / (safeWidth || 80));
            const toolLines = (msg.tool_calls?.length || 0) * 4;
            return contentLines + toolLines + 2;
        };
    }, [messages, safeWidth]);

    const keyExtractor = useCallback((item: Message) => item.id, []);

    const renderItem = useCallback(({ item }: { item: Message }) => (
        <Box paddingBottom={1} width={safeWidth}>
            <MessageItem msg={item} />
        </Box>
    ), [safeWidth]);

    // --- NORMAL MODE: Smart Static Splitting ---
    // Logikanya: Pesan lama masuk <Static> (Frozen, performa tinggi).
    // Pesan terakhir (yang lagi ngetik/loading) masuk render biasa biar animasinya jalan.
    if (!isFullScreen) {
        let completedMessages: Message[] = [];
        let activeMessages: Message[] = [];

        if (isLoading && messages.length > 0) {
            // Kalau lagi loading, pesan terakhir pasti lagi update. Jangan dibekukan.
            completedMessages = messages.slice(0, -1);
            activeMessages = [messages[messages.length - 1]];
        } else {
            // Kalau idle, semua pesan sudah final. Bekukan semua.
            completedMessages = messages;
            activeMessages = [];
        }

        return (
            <Box flexDirection="column" width={safeWidth}>
                {completedMessages.length > 0 && (
                    <Static items={completedMessages}>
                        {(msg, index) => (
                            <Box key={msg.id || index} paddingBottom={1} width={safeWidth}>
                                <MessageItem msg={msg} />
                            </Box>
                        )}
                    </Static>
                )}

                {/* Active Message Area (Streaming) */}
                {activeMessages.map((msg, index) => (
                    <Box key={msg.id || 'active'} width={safeWidth}>
                        <MessageItem msg={msg} />
                    </Box>
                ))}
            </Box>
        );
    }

    // --- FULL SCREEN MODE: Virtualized List ---
    return (
        <Box ref={containerRef} flexDirection="column" flexGrow={1} height="100%" width={safeWidth}>
            <VirtualizedList
                ref={listRef}
                data={messages}
                renderItem={renderItem}
                estimatedItemHeight={estimatedItemHeight}
                keyExtractor={keyExtractor}
                initialScrollIndex={messages.length > 0 ? messages.length - 1 : 0}
                initialScrollOffsetInIndex={Number.MAX_SAFE_INTEGER}
            />
        </Box>
    );
});

export default HistoryViewport; // [FIX] Default Export