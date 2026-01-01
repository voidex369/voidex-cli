/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useStdin } from 'ink';
import type React from 'react';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
} from 'react';
import { ESC } from '../utils/input.js';
import { debugLogger } from '../../lib/gemini-core-mock.js';
import { appEvents, AppEvent } from '../../utils/events.js';
import {
    isIncompleteMouseSequence,
    parseMouseEvent,
    type MouseEvent,
    type MouseEventName,
    type MouseHandler,
} from '../utils/mouse.js';

export type { MouseEvent, MouseEventName, MouseHandler };

const MAX_MOUSE_BUFFER_SIZE = 4096;

interface MouseContextValue {
    subscribe: (handler: MouseHandler) => void;
    unsubscribe: (handler: MouseHandler) => void;
}

const MouseContext = createContext<MouseContextValue | undefined>(undefined);

export function useMouseContext() {
    const context = useContext(MouseContext);
    if (!context) {
        throw new Error('useMouseContext must be used within a MouseProvider');
    }
    return context;
}

export function useMouse(handler: MouseHandler, { isActive = true } = {}) {
    const { subscribe, unsubscribe } = useMouseContext();

    useEffect(() => {
        if (!isActive) {
            return;
        }

        subscribe(handler);
        return () => unsubscribe(handler);
    }, [isActive, handler, subscribe, unsubscribe]);
}

export function MouseProvider({
    children,
    mouseEventsEnabled,
    debugKeystrokeLogging,
}: {
    children: React.ReactNode;
    mouseEventsEnabled?: boolean;
    debugKeystrokeLogging?: boolean;
}) {
    const { stdin } = useStdin();
    const subscribers = useRef<Set<MouseHandler>>(new Set()).current;

    const subscribe = useCallback(
        (handler: MouseHandler) => {
            subscribers.add(handler);
        },
        [subscribers],
    );

    const unsubscribe = useCallback(
        (handler: MouseHandler) => {
            subscribers.delete(handler);
        },
        [subscribers],
    );

    useEffect(() => {
        if (!mouseEventsEnabled) {
            return;
        }

        let mouseBuffer = '';

        const broadcast = (event: MouseEvent) => {
            let handled = false;
            for (const handler of subscribers) {
                if (handler(event) === true) {
                    handled = true;
                }
            }
            if (
                !handled &&
                event.name === 'move' &&
                event.col >= 0 &&
                event.row >= 0 &&
                event.button === 'left'
            ) {
                appEvents.emit(AppEvent.SelectionWarning);
            }
        };

        const handleData = (data: Buffer | string) => {
            mouseBuffer += typeof data === 'string' ? data : data.toString('utf-8');

            if (mouseBuffer.length > MAX_MOUSE_BUFFER_SIZE) {
                mouseBuffer = mouseBuffer.slice(-MAX_MOUSE_BUFFER_SIZE);
            }

            while (mouseBuffer.length > 0) {
                const parsed = parseMouseEvent(mouseBuffer);

                if (parsed) {
                    if (debugKeystrokeLogging) {
                        debugLogger.log(
                            '[DEBUG] Mouse event parsed:',
                            JSON.stringify(parsed.event),
                        );
                    }
                    broadcast(parsed.event);
                    mouseBuffer = mouseBuffer.slice(parsed.length);
                    continue;
                }

                if (isIncompleteMouseSequence(mouseBuffer)) {
                    break; // Wait for more data
                }

                const nextEsc = mouseBuffer.indexOf(ESC, 1);
                if (nextEsc !== -1) {
                    mouseBuffer = mouseBuffer.slice(nextEsc);
                } else {
                    mouseBuffer = '';
                    break;
                }
            }
        };

        stdin.on('data', handleData);

        return () => {
            stdin.removeListener('data', handleData);
        };
    }, [stdin, mouseEventsEnabled, subscribers, debugKeystrokeLogging]);

    return (
        <MouseContext.Provider value={{ subscribe, unsubscribe }}>
            {children}
        </MouseContext.Provider>
    );
}
