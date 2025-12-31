import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';

const CONFIG_DIR = path.join(os.homedir(), '.voidex-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const HISTORY_DIR = path.join(CONFIG_DIR, 'history');

if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

const ConfigSchema = z.object({
    apiKey: z.string().optional(),
    model: z.string().default('google/gemini-2.0-flash-exp:free'),
});

type Config = z.infer<typeof ConfigSchema>;

export function getGenericConfig(): Config {
    try {
        if (!fs.existsSync(CONFIG_FILE)) return { model: 'google/gemini-2.0-flash-exp:free' };
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return ConfigSchema.parse(JSON.parse(raw));
    } catch (e) {
        return { model: 'google/gemini-2.0-flash-exp:free' };
    }
}

export function saveConfig(newConfig: Partial<Config>) {
    const current = getGenericConfig();
    const merged = { ...current, ...newConfig };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

export function getApiKey(): string | undefined {
    return getGenericConfig().apiKey;
}

export function saveApiKey(key: string) {
    saveConfig({ apiKey: key });
}

export function getAvailableModels(): string[] {
    return [
        'xiaomi/mimo-v2-flash:free',
        'alibaba/tongyi-deepresearch-30b-a3b:free',
        'allenai/olmo-3-32b-think:free',
        'allenai/olmo-3.1-32b-think:free',
        'anthropic/claude-3-opus',
        'anthropic/claude-3-sonnet',
        'arcee-ai/trinity-mini:free',

        // --- [UNCENSORED] Models for Security Research ---
        'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', // [UNCENSORED]
        'nousresearch/hermes-3-llama-3.1-405b:free', // [UNCENSORED]
        'mistralai/mixtral-8x22b-instruct', // [UNCENSORED]
        'liquid/lfm-40b:free', // [UNCENSORED]

        'google/gemini-2.0-flash-exp:free',
        'google/gemini-2.5-flash-image',
        'google/gemini-2.5-flash-image-preview',
        'google/gemini-2.5-flash-lite',
        'google/gemini-2.5-flash-lite-preview-09-2025',
        'google/gemini-2.5-flash-preview-09-2025',
        'google/gemini-3-flash-preview',
        'google/gemini-3-pro-image-preview',
        'google/gemini-3-pro-preview',
        'google/gemini-pro-1.5',
        'kwaipilot/kat-coder-pro:free',
        'meta-llama/llama-3-70b-instruct',
        'mistral/mistral-large',
        'mistralai/devstral-2512:free',
        'moonshotai/kimi-k2:free',
        'nex-agi/deepseek-v3.1-nex-n1:free',
        'nvidia/nemotron-3-nano-30b-a3b:free',
        'nvidia/nemotron-nano-12b-v2-vl:free',
        'nvidia/nemotron-nano-9b-v2:free',
        'openai/gpt-4o',
        'openai/gpt-oss-120b:free',
        'openai/gpt-oss-20b:free',
        'qwen/qwen3-coder:free',
        'tngtech/tng-r1t-chimera:free',
        'z-ai/glm-4.5-air:free'
    ];
}

export function getModelDisplayName(modelId: string): string {
    const uncensoredModels = [
        'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
        'nousresearch/hermes-3-llama-3.1-405b:free',
        'mistralai/mixtral-8x22b-instruct',
        'liquid/lfm-40b:free'
    ];

    if (uncensoredModels.includes(modelId)) {
        return `${modelId} (Uncensored)`;
    }
    return modelId;
}

export function saveModel(model: string) {
    saveConfig({ model });
}

export function saveChat(name: string, messages: any[]) {
    const file = path.join(HISTORY_DIR, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(messages, null, 2));
}

export function loadChat(name: string): any[] {
    const file = path.join(HISTORY_DIR, `${name}.json`);
    if (!fs.existsSync(file)) return [];
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
        return [];
    }
}

export function listChats(): string[] {
    if (!fs.existsSync(HISTORY_DIR)) return [];
    return fs.readdirSync(HISTORY_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
}

export function deleteChat(name: string): boolean {
    const file = path.join(HISTORY_DIR, `${name}.json`);
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        return true;
    }
    return false;
}

export function exportChat(filePath: string, messages: any[]) {
    // If not absolute path, put it in current working directory
    const target = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const content = filePath.endsWith('.json')
        ? JSON.stringify(messages, null, 2)
        : messages.map(m => `[${m.role.toUpperCase()}]\n${m.content || ''}\n`).join('\n---\n\n');

    fs.writeFileSync(target, content);
}
