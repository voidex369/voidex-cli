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

    // [FIX] Safe width to prevent wrapping with terminal scrollbar (extra padding for different terminals)
    const safeWidth = Math.max(20, width - 5);

    // Initial estimation callback for VirtualizedList
    const estimatedItemHeight = useMemo(() => {
        return (index: number) => {
            const msg = messages[index];
            if (!msg) return 3;
            const contentLines = Math.max(1, (msg.content?.length || 0) / (safeWidth || 80));
            const toolLines = (msg.tool_calls?.length || 0) * 4;
            return Math.ceil(contentLines + toolLines + 2);
        };
    }, [messages, safeWidth]);

    const renderItem = useMemo(() => {
        return ({ item }: { item: Message }) => (
            <Box paddingBottom={1} width={safeWidth}>
                <MessageItem msg={item} />
            </Box>
        );
    }, [safeWidth]);

    const keyExtractor = useMemo(() => {
        return (item: Message) => item.id || `msg-${Math.random()}`;
    }, []);

    // --- Scrolling Logic (Only for Full Screen) ---
    const scrollBy = useCallback((delta: number) => {
        if (isFullScreen) listRef.current?.scrollBy(delta);
    }, [isFullScreen]);

    const getScrollState = useCallback(() => {
        return listRef.current?.getScrollState() || { scrollTop: 0, scrollHeight: 0, innerHeight: 0 };
    }, []);

    const hasFocus = useCallback(() => isFullScreen, [isFullScreen]);
    const flashScrollbar = useCallback(() => { }, []);

    const scrollableEntry = useMemo(() => ({
        ref: containerRef,
        getScrollState,
        scrollBy,
        hasFocus,
        flashScrollbar,
    }), [getScrollState, scrollBy, hasFocus, flashScrollbar]);

    useScrollable(scrollableEntry, isFullScreen);

    // Keyboard Scrolling (Only for Full Screen)
    useKeypress((key) => {
        if (!isFullScreen) return;
        if (key.shift && key.name === 'up') scrollBy(-1);
        if (key.shift && key.name === 'down') scrollBy(1);
        if (key.name === 'pageup') scrollBy(-10);
        if (key.name === 'pagedown') scrollBy(10);
    }, { isActive: isFullScreen });

    // --- INLINE MODE: Static History ---
    if (!isFullScreen) {
        // [FIX] Robust Static Logic to prevent flickering and duplicates:
        // We only move messages to Static that are from PREVIOUS turns.
        // A "Turn" consists of a user message and all subsequent AI messages/tool results.

        let completedMessages: Message[] = [];
        let activeMessages: Message[] = [];

        if (isLoading && messages.length > 0) {
            // [FIX] Move everything except the streaming message to Static.
            // This prevents the previous (User) message from re-rendering borders during streaming.
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
                    <Box key={msg.id} paddingBottom={1} width={safeWidth}>
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
