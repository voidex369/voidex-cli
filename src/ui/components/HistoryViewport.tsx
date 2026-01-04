/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useMemo, useCallback } from 'react';
import { Box, Static, type DOMElement } from 'ink';
import { VirtualizedList, VirtualizedListRef } from './shared/VirtualizedList.js';
import { MessageItem } from './MessageItem.js';
import { Message } from '../../types/index.js';
import { useScrollable } from '../contexts/ScrollProvider.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useWindowSize } from '../hooks/useWindowSize.js';

interface HistoryViewportProps {
    messages: Message[];
    isFullScreen?: boolean;
    isLoading?: boolean;
}

export const HistoryViewport = React.memo(({ messages, isFullScreen = false, isLoading = false }: HistoryViewportProps) => {
    const listRef = useRef<VirtualizedListRef<Message>>(null);
    const containerRef = useRef<DOMElement>(null);

    const { width } = useWindowSize();

    // [FIX] Safe width to prevent wrapping with terminal scrollbar
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

    // [FIX TYPE ERROR] Destructure { item } from the arguments object
    const renderItem = useCallback(({ item }: { item: Message }) => (
        <Box paddingBottom={1} width={safeWidth}>
            <MessageItem msg={item} />
        </Box>
    ), [safeWidth]);

    // --- NORMAL MODE: Static + Active Message ---
    if (!isFullScreen) {
        let completedMessages: Message[] = [];
        let activeMessages: Message[] = [];

        if (isLoading && messages.length > 0) {
            completedMessages = messages.slice(0, -1);
            activeMessages = [messages[messages.length - 1]];
        } else {
            // Idle: Everything is committed to Static.
            completedMessages = messages;
            activeMessages = [];
        }

        return (
            <Box flexDirection="column" width={safeWidth}>
                {completedMessages.length > 0 && (
                    <Static items={completedMessages}>
                        {(msg) => (
                            <Box key={msg.id} paddingBottom={1} width={safeWidth}>
                                <MessageItem msg={msg} />
                            </Box>
                        )}
                    </Static>
                )}
                {activeMessages.map((msg) => (
                    // [FIX] HAPUS paddingBottom={1} DI SINI!
                    // Pesan aktif tidak boleh punya padding bawah berlebih agar cursor Ink stabil.
                    <Box key={msg.id} width={safeWidth}>
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