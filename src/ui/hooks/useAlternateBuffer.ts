/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

// ANSI escape sequences for alternate buffer
const ENTER_ALT_BUFFER = '\x1b[?1049h';
const EXIT_ALT_BUFFER = '\x1b[?1049l';

export const useAlternateBuffer = (active: boolean = true) => {
    useEffect(() => {
        if (!process.stdout.isTTY) return;

        if (active) {
            process.stdout.write(ENTER_ALT_BUFFER);
        }

        return () => {
            if (active && process.stdout.isTTY) {
                process.stdout.write(EXIT_ALT_BUFFER);
            }
        };
    }, [active]);
};
