import { Message } from '../types/index.js';

const MAX_CONTENT_LENGTH = 50000;
const MAX_HISTORY_CHARS = 100000;

export function truncateForRAM(content: string | null): string | null {
    if (!content) return content;
    if (content.length > MAX_CONTENT_LENGTH) {
        return content.slice(0, MAX_CONTENT_LENGTH) + "\n\n... [ TRUNCATED AT 50KB FOR EXTREME RAM STABILITY ] ...";
    }
    return content;
}

export function pruneHistoryByChars(messages: Message[]): Message[] {
    let totalChars = 0;
    const result: Message[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        const mChars = (m.content?.length || 0) + (JSON.stringify(m.tool_calls || []).length);
        if (totalChars + mChars > MAX_HISTORY_CHARS) {
            if (m.role === 'user' && i === messages.findIndex(msg => msg.role === 'user')) {
                result.unshift(m);
            }
            break;
        }
        result.unshift(m);
        totalChars += mChars;
    }
    return result;
}
