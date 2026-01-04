import fs from 'fs';
import path from 'path';
import os from 'os';
import { Message } from '../types/index.js';

// --- CONSTANTS ---
const HOMEDIR = os.homedir();
// Folder Utama: ~/.voidex-cli
const CONFIG_DIR = path.join(HOMEDIR, '.voidex-cli');
// File Config JSON (Model, Theme, dll)
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
// Folder Chat History
const CHATS_DIR = path.join(CONFIG_DIR, 'chats');

// [PENTING] Lokasi .env sekarang di GLOBAL (~/.voidex-cli/.env)
// Biar bisa diakses dari direktori mana saja saat pakai CLI.
const ENV_PATH = path.join(CONFIG_DIR, '.env');

// --- INTERFACES ---
interface CliConfig {
    model: string;
    apiKey?: string; // Legacy support (akan dihapus otomatis)
    theme?: string;
}

// --- INITIALIZATION ---
function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (!fs.existsSync(CHATS_DIR)) {
        fs.mkdirSync(CHATS_DIR, { recursive: true });
    }
}

// --- CORE CONFIG (JSON) ---
export function getGenericConfig(): CliConfig {
    ensureConfigDir();
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            return { model: 'google/gemini-2.0-flash-exp:free' };
        }
    }
    return { model: 'google/gemini-2.0-flash-exp:free' };
}

export function saveGenericConfig(config: CliConfig) {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// --- API KEY MANAGEMENT (GLOBAL ENV) ---

export function getApiKey(): string | undefined {
    // 1. Cek Memory Node.js (Prioritas Utama)
    if (process.env.OPENROUTER_API_KEY) {
        return process.env.OPENROUTER_API_KEY;
    }

    // 2. Cek Global .env File (~/.voidex-cli/.env)
    if (fs.existsSync(ENV_PATH)) {
        try {
            const content = fs.readFileSync(ENV_PATH, 'utf-8');
            // Regex cari OPENROUTER_API_KEY=...
            const match = content.match(/^OPENROUTER_API_KEY=(.*)$/m);
            if (match && match[1]) {
                const key = match[1].trim();
                process.env.OPENROUTER_API_KEY = key; // Cache ke memory biar cepet
                return key;
            }
        } catch (e) {
            // Ignore error read
        }
    }

    return undefined;
}

export function saveApiKey(apiKey: string): void {
    ensureConfigDir(); // Pastikan folder ~/.voidex-cli ada

    const keyName = 'OPENROUTER_API_KEY';
    const trimmedKey = apiKey.trim();

    // 1. Update Memory (Runtime)
    process.env[keyName] = trimmedKey;

    // 2. Update Global .env File
    let content = '';
    if (fs.existsSync(ENV_PATH)) {
        content = fs.readFileSync(ENV_PATH, 'utf-8');
    }

    const keyRegex = new RegExp(`^${keyName}=(.*)$`, 'm');

    if (keyRegex.test(content)) {
        // Kalau key sudah ada, timpa barisnya
        content = content.replace(keyRegex, `${keyName}=${trimmedKey}`);
    } else {
        // Kalau belum ada, tambahkan di baris baru
        const prefix = content.endsWith('\n') || content === '' ? '' : '\n';
        content += `${prefix}${keyName}=${trimmedKey}\n`;
    }

    fs.writeFileSync(ENV_PATH, content, 'utf-8');

    // 3. Security Cleanup: Hapus API Key dari config.json (Legacy)
    // Biar gak double nyimpen dan config.json bersih dari credential.
    const currentConfig = getGenericConfig();
    if (currentConfig.apiKey) {
        delete currentConfig.apiKey;
        saveGenericConfig(currentConfig);
    }
}

// --- MODEL MANAGEMENT ---

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

// [FIXED] Hanya satu fungsi getModelDisplayName & Nama Model Full
export function getModelDisplayName(model: string): string {
    const uncensoredModels = [
        'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
        'nousresearch/hermes-3-llama-3.1-405b:free',
        'mistralai/mixtral-8x22b-instruct',
        'liquid/lfm-40b:free'
    ];

    if (uncensoredModels.includes(model)) {
        return `${model} (Uncensored)`;
    }

    // Kembalikan nama full tanpa dipotong (split)
    return model;
}

export function saveModel(model: string) {
    const config = getGenericConfig();
    config.model = model;
    saveGenericConfig(config);
}

// --- CHAT SESSION MANAGEMENT ---

export function saveChat(id: string, messages: Message[]) {
    ensureConfigDir();
    const cleanId = id.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filePath = path.join(CHATS_DIR, `${cleanId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf-8');
}

export function loadChat(id: string): Message[] {
    const cleanId = id.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filePath = path.join(CHATS_DIR, `${cleanId}.json`);
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            return [];
        }
    }
    return [];
}

export function listChats(): string[] {
    ensureConfigDir();
    if (!fs.existsSync(CHATS_DIR)) return [];
    return fs.readdirSync(CHATS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
}

export function deleteChat(id: string): boolean {
    const cleanId = id.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filePath = path.join(CHATS_DIR, `${cleanId}.json`);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
    }
    return false;
}

export function exportChat(fileName: string, messages: Message[]) {
    // Export ke folder tempat user menjalankan perintah (CWD)
    const targetPath = path.resolve(process.cwd(), fileName);

    let content = '';
    if (fileName.endsWith('.json')) {
        content = JSON.stringify(messages, null, 2);
    } else {
        content = messages.map(m => {
            return `[${m.role.toUpperCase()}] (${m.id})\n${m.content || '(Tool Call)'}\n${'-'.repeat(40)}`;
        }).join('\n\n');
    }

    fs.writeFileSync(targetPath, content, 'utf-8');
}