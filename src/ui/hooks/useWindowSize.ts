/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

export function useWindowSize() {
    const { stdout } = useStdout();
    const [size, setSize] = useState({
        width: stdout?.columns || 80,
        height: stdout?.rows || 24,
    });

    useEffect(() => {
        if (!stdout) return;

        const onResize = () => {
            setSize({
                width: stdout.columns,
                height: stdout.rows,
            });
        };

        stdout.on('resize', onResize);
        return () => {
            stdout.off('resize', onResize);
        };
    }, [stdout]);

    return size;
}
