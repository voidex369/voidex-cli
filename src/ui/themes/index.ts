/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Theme {
    name: string;
    text: {
        primary: string;
        secondary: string;
        link: string;
        accent: string;
        response: string;
    };
    background: {
        primary: string;
        diff: {
            added: string;
            removed: string;
        };
    };
    border: {
        default: string;
        focused: string;
    };
    ui: {
        comment: string;
        symbol: string;
        dark: string;
        gradient: string[];
    };
    status: {
        error: string;
        success: string;
        warning: string;
    };
}

export const themes: Record<string, Theme> = {
    dark: {
        name: 'dark',
        text: {
            primary: '',
            secondary: '#6C7086',
            link: '#89B4FA',
            accent: '#CBA6F7',
            response: '',
        },
        background: {
            primary: '#1E1E2E',
            diff: {
                added: '#28350B',
                removed: '#430000',
            },
        },
        border: {
            default: '#6C7086',
            focused: '#89B4FA',
        },
        ui: {
            comment: '#6C7086',
            symbol: '#6C7086',
            dark: '#45485A',
            gradient: ['#4796E4', '#847ACE', '#C3677F'],
        },
        status: {
            error: '#F38BA8',
            success: '#A6E3A1',
            warning: '#F9E2AF',
        },
    },
    light: {
        name: 'light',
        text: {
            primary: '#4c4f69',
            secondary: '#9ca0b0',
            link: '#1e66f5',
            accent: '#8839ef',
            response: '#4c4f69',
        },
        background: {
            primary: '#eff1f5',
            diff: {
                added: '#e6e9ef',
                removed: '#ccd0da',
            },
        },
        border: {
            default: '#9ca0b0',
            focused: '#1e66f5',
        },
        ui: {
            comment: '#9ca0b0',
            symbol: '#9ca0b0',
            dark: '#bcc0cc',
            gradient: ['#1e66f5', '#8839ef', '#ea76cb'],
        },
        status: {
            error: '#d20f39',
            success: '#40a02b',
            warning: '#df8e1d',
        },
    },
};

export const defaultTheme = themes.dark;
