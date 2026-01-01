/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import type { MouseHandler, MouseEvent } from '../contexts/MouseContext.js';
import { useMouseContext } from '../contexts/MouseContext.js';

export type { MouseEvent };

export function useMouse(
    onMouseEvent: MouseHandler,
    { isActive }: { isActive: boolean },
) {
    const { subscribe, unsubscribe } = useMouseContext();

    useEffect(() => {
        if (!isActive) {
            return;
        }

        subscribe(onMouseEvent);
        return () => {
            unsubscribe(onMouseEvent);
        };
    }, [isActive, onMouseEvent, subscribe, unsubscribe]);
}
