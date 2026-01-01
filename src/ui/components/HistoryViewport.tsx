/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useMemo, useCallback } from 'react';
import { Box, type DOMElement } from 'ink';
import { VirtualizedList, VirtualizedListRef } from './shared/VirtualizedList.js';
import { MessageItem } from './MessageItem.js';
import { Message } from '../../types/index.js';
import { useScrollable } from '../contexts/ScrollProvider.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface HistoryViewportProps {
    messages: Message[];
}

export const HistoryViewport = React.memo(({ messages }: HistoryViewportProps) => {
    const listRef = useRef<VirtualizedListRef<Message>>(null);
    const containerRef = useRef<DOMElement>(null);

    // Initial estimation callback
    const estimatedItemHeight = useMemo(() => {
        return (index: number) => {
            const msg = messages[index];
            // Safe fallback if msg is undefined
            if (!msg) return 3;

            // Rough estimation
            const contentLines = Math.max(1, (msg.content?.length || 0) / 80);
            const toolLines = (msg.tool_calls?.length || 0) * 4;
            // Add padding/margins
            return Math.ceil(contentLines + toolLines + 2);
        };
    }, [messages]);

    const renderItem = useMemo(() => {
        return ({ item }: { item: Message }) => (
            <Box paddingBottom={1}>
                <MessageItem msg={item} />
            </Box>
        );
    }, []);

    const keyExtractor = useMemo(() => {
        return (item: Message) => item.id || `msg-${Math.random()}`;
    }, []);

    // --- Scrolling Logic ---
    const scrollBy = useCallback((delta: number) => {
        listRef.current?.scrollBy(delta);
    }, []);

    const getScrollState = useCallback(() => {
        return listRef.current?.getScrollState() || { scrollTop: 0, scrollHeight: 0, innerHeight: 0 };
    }, []);

    const hasFocus = useCallback(() => true, []); // Always valid target for mouse wheel if hovered
    const flashScrollbar = useCallback(() => { }, []); // No-op for now

    const scrollableEntry = useMemo(() => ({
        ref: containerRef,
        getScrollState,
        scrollBy,
        hasFocus,
        flashScrollbar,
    }), [getScrollState, scrollBy, hasFocus, flashScrollbar]);

    useScrollable(scrollableEntry, true);

    // Keyboard Scrolling (Shift + Arrow Up/Down, Page Up/Down)
    useKeypress((key) => {
        if (key.shift && key.name === 'up') scrollBy(-1);
        if (key.shift && key.name === 'down') scrollBy(1);
        if (key.name === 'pageup') scrollBy(-10);
        if (key.name === 'pagedown') scrollBy(10);
    }, { isActive: true });

    return (
        <Box ref={containerRef} flexDirection="column" flexGrow={1} height="100%">
            <VirtualizedList
                ref={listRef}
                data={messages}
                renderItem={renderItem}
                estimatedItemHeight={estimatedItemHeight}
                keyExtractor={keyExtractor}
                // Start at the bottom for chat
                initialScrollIndex={messages.length > 0 ? messages.length - 1 : 0}
                initialScrollOffsetInIndex={Number.MAX_SAFE_INTEGER}
            />
        </Box>
    );
});
