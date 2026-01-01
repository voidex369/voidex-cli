/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import type { KeypressHandler, Key } from '../contexts/KeypressContext.js';
import { useKeypressContext } from '../contexts/KeypressContext.js';

export type { Key };

export function useKeypress(
    onKeypress: KeypressHandler,
    { isActive }: { isActive: boolean },
) {
    const { subscribe, unsubscribe } = useKeypressContext();

    useEffect(() => {
        if (!isActive) {
            return;
        }

        subscribe(onKeypress);
        return () => {
            unsubscribe(onKeypress);
        };
    }, [isActive, onKeypress, subscribe, unsubscribe]);
}
