/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionEvents, McpClient } from '../lib/gemini-core-mock.js';
import { EventEmitter } from 'events';

export enum AppEvent {
    OpenDebugConsole = 'open-debug-console',
    OauthDisplayMessage = 'oauth-display-message',
    Flicker = 'flicker',
    McpClientUpdate = 'mcp-client-update',
    SelectionWarning = 'selection-warning',
    PasteTimeout = 'paste-timeout',
}

export interface AppEvents extends ExtensionEvents {
    [AppEvent.OpenDebugConsole]: never[];
    [AppEvent.OauthDisplayMessage]: string[];
    [AppEvent.Flicker]: never[];
    [AppEvent.McpClientUpdate]: Array<Map<string, McpClient> | never>;
    [AppEvent.SelectionWarning]: never[];
    [AppEvent.PasteTimeout]: never[];
}

// Typed EventEmitter wrapper
class TypedEventEmitter<T extends Record<string, any[]>> extends EventEmitter {
    emit<K extends keyof T & string>(eventName: K, ...args: T[K]): boolean {
        return super.emit(eventName, ...args);
    }

    on<K extends keyof T & string>(eventName: K, listener: (...args: T[K]) => void): this {
        return super.on(eventName, listener as any);
    }
}

export const appEvents = new TypedEventEmitter<AppEvents>();
