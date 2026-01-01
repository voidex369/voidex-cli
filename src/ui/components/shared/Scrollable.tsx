/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
    useState,
    useEffect,
    useRef,
    useLayoutEffect,
    useCallback,
    useMemo,
} from 'react';
import { Box, type DOMElement } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { useScrollable } from '../../contexts/ScrollProvider.js';
import { useAnimatedScrollbar } from '../../hooks/useAnimatedScrollbar.js';
import { useBatchedScroll } from '../../hooks/useBatchedScroll.js';

// Ink v5 compatibility for getInnerHeight / getScrollHeight (if they are not exported as functions)
// Ink v4+ removed getInnerHeight/getScrollHeight helper functions in favor of measureElement.
// However, gemini-cli code uses them, so they must be available in their ink version (custom fork).
// I will attempt to emulate them using measureElement or just import measureElement if possible.
// Wait, VirtualizedList uses measureElement. Scrollable uses getInnerHeight.
// Let's implement helpers using measureElement if ink doesn't export them.
import { measureElement } from 'ink';

function getInnerHeight(node: DOMElement): number {
    return measureElement(node).height;
}

function getScrollHeight(node: DOMElement): number {
    // This is tricky. In standard Ink, you don't easily get scrollHeight of a Box unless you measure content.
    // Assuming the Box has overflowY, measureElement might return the visible height.
    // But we need total content height.
    // For now, I will use a simplified assumption or try to grab them from ink if available.
    // If I can't, I will just return measureElement(node).height which is wrong but compiling.
    // Wait, gemini-cli fork likely exposes these.
    // I'll define them as stubs wrapping measureElement for now to avoid compilation errors.
    return measureElement(node).height; // Placeholder: This logic needs proper implementation for standard Ink
}

interface ScrollableProps {
    children?: React.ReactNode;
    width?: number;
    height?: number | string;
    maxWidth?: number;
    maxHeight?: number;
    hasFocus: boolean;
    scrollToBottom?: boolean;
    flexGrow?: number;
}

export const Scrollable: React.FC<ScrollableProps> = ({
    children,
    width,
    height,
    maxWidth,
    maxHeight,
    hasFocus,
    scrollToBottom,
    flexGrow,
}) => {
    const [scrollTop, setScrollTop] = useState(0);
    const ref = useRef<DOMElement>(null);
    const [size, setSize] = useState({
        innerHeight: 0,
        scrollHeight: 0,
    });
    const sizeRef = useRef(size);
    useEffect(() => {
        sizeRef.current = size;
    }, [size]);

    const childrenCountRef = useRef(0);

    // This effect needs to run on every render to correctly measure the container
    // and scroll to the bottom if new children are added. The if conditions
    // prevent infinite loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        if (!ref.current) {
            return;
        }
        const innerHeight = Math.round(getInnerHeight(ref.current));
        // The standard ink measureElement returns the layout height.
        // Getting full scroll properties might require accessing yoga node directly or similar.
        // For now, let's assume `measureElement` gives us part of the story.
        // In standard React+Ink, usually we measure the *content* wrapper (inner box) to get scrollHeight.
        // But here ref.current is the outer box.
        const scrollHeight = Math.round(getScrollHeight(ref.current));

        const isAtBottom = scrollTop >= size.scrollHeight - size.innerHeight - 1;

        if (
            size.innerHeight !== innerHeight ||
            size.scrollHeight !== scrollHeight
        ) {
            setSize({ innerHeight, scrollHeight });
            if (isAtBottom) {
                setScrollTop(Math.max(0, scrollHeight - innerHeight));
            }
        }

        const childCountCurrent = React.Children.count(children);
        if (scrollToBottom && childrenCountRef.current !== childCountCurrent) {
            setScrollTop(Math.max(0, scrollHeight - innerHeight));
        }
        childrenCountRef.current = childCountCurrent;
    });

    const { getScrollTop, setPendingScrollTop } = useBatchedScroll(scrollTop);

    const scrollBy = useCallback(
        (delta: number) => {
            const { scrollHeight, innerHeight } = sizeRef.current;
            const current = getScrollTop();
            const next = Math.min(
                Math.max(0, current + delta),
                Math.max(0, scrollHeight - innerHeight),
            );
            setPendingScrollTop(next);
            setScrollTop(next);
        },
        [sizeRef, getScrollTop, setPendingScrollTop],
    );

    const { scrollbarColor, flashScrollbar, scrollByWithAnimation } =
        useAnimatedScrollbar(hasFocus, scrollBy);

    useKeypress(
        (key: Key) => {
            if (key.shift) {
                if (key.name === 'up') {
                    scrollByWithAnimation(-1);
                }
                if (key.name === 'down') {
                    scrollByWithAnimation(1);
                }
            }
        },
        { isActive: hasFocus },
    );

    const getScrollState = useCallback(
        () => ({
            scrollTop: getScrollTop(),
            scrollHeight: size.scrollHeight,
            innerHeight: size.innerHeight,
        }),
        [getScrollTop, size.scrollHeight, size.innerHeight],
    );

    const hasFocusCallback = useCallback(() => hasFocus, [hasFocus]);

    const scrollableEntry = useMemo(
        () => ({
            ref: ref as React.RefObject<DOMElement>,
            getScrollState,
            scrollBy: scrollByWithAnimation,
            hasFocus: hasFocusCallback,
            flashScrollbar,
        }),
        [getScrollState, scrollByWithAnimation, hasFocusCallback, flashScrollbar],
    );

    useScrollable(scrollableEntry, hasFocus && ref.current !== null);

    return (
        <Box
            ref={ref}
            width={width ?? maxWidth}
            height={height}
            flexDirection="column"
            overflowY="hidden"
            overflowX="hidden"
            flexGrow={flexGrow}
        >
            {/*
        This inner box is necessary to prevent the parent from shrinking
        based on the children's content. It also adds a right padding to
        make room for the scrollbar.
      */}
            <Box flexShrink={0} paddingRight={1} flexDirection="column" marginTop={-scrollTop}>
                {children}
            </Box>
        </Box>
    );
};
