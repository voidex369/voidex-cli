import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import os from 'os';

export type ToolResult = {
    output: string;
    isError: boolean;
};

export type StreamCallback = (chunk: string) => void;

// Global tracker for the active shell process to enable Ctrl+C killing
let activeChildProcess: any = null;

export function killActiveProcess() {
    if (activeChildProcess) {
        try {
            activeChildProcess.kill('SIGKILL'); // Force kill
            activeChildProcess = null;
            return true;
        } catch (e) {
            console.error('Failed to kill process:', e);
            return false;
        }
    }
    return false;
}

// 1. Shell / run_shell_command (Ultra-Smart Heuristic Detection)
export async function runShellCommand({ command, onOutput, timeout }: { command: string, onOutput?: StreamCallback, timeout?: number }): Promise<ToolResult> {
    const isWin = os.platform() === 'win32';

    // [SECURITY REJECTION] Sudo Guard
    if (!isWin && command.trim().startsWith('sudo') && !command.includes(' -S')) {
        return {
            output: "Minta password sudo ke user, lalu coba lagi perintahnya menggunakan format: echo 'PASSWORD' | sudo -S [perintah]",
            isError: true
        };
    }

    return new Promise((resolve) => {
        let shell = isWin ? 'cmd.exe' : '/bin/bash';
        if (!isWin && !fs.existsSync('/bin/bash')) {
            shell = '/bin/sh';
        }

        const shellArgs = isWin ? ['/c', command] : ['-c', command];
        const child = spawn(shell, shellArgs);
        activeChildProcess = child;

        const MAX_BUFFER_SIZE = 50000;

        // Tool berat tetap kita biarkan jalan selamanya (Infinity Timeout)
        const isHeavyTool = /^(sqlmap|nmap|hydra|wpscan|nikto|gobuster|ffuf|dirb|ping|ssh|tail|watch|nc|netcat)/i.test(command.trim());
        const DEFAULT_IDLE_TIMEOUT = 30000; // 30s buat tool biasa

        let output = '';
        let isError = false;
        let isKilled = false;
        let isTimeout = false;
        let timer: NodeJS.Timeout | null = null;

        const killOnTimeout = () => {
            if (activeChildProcess === child) {
                isTimeout = true;
                isKilled = true;
                child.kill('SIGKILL');
            }
        };

        const setKillTimer = (duration: number) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(killOnTimeout, duration);
        };

        const clearKillTimer = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };

        // [LOGIC BARU] DETEKSI PERTANYAAN (HEURISTIC)
        // Kita gunakan logika "Paranoid" untuk mendeteksi segala jenis input prompt.
        const isInteractivePrompt = (text: string): boolean => {
            const lines = text.trim().split('\n');
            const lastLine = lines[lines.length - 1] || '';
            const cleanLine = lastLine.trim().toLowerCase();

            // 1. Cek pola spesifik (High Confidence)
            if (/(\[y\/n\]|\(y\/n\)|\? y\/n|password:|passphrase:|confirm\s*:)/i.test(cleanLine)) return true;

            // 2. Cek pola umum pertanyaan (Medium Confidence)
            // Berakhiran tanda tanya, titik dua, atau panah input, DAN pendek (< 80 char)
            const endsWithSymbol = /[\?:>]$/.test(cleanLine);
            if (endsWithSymbol && cleanLine.length < 80) return true;

            // 3. Cek kata kerja perintah input
            const hasInputKeywords = /^(enter|select|choose|type|provide|input)\s+/i.test(cleanLine);
            if (hasInputKeywords && !cleanLine.includes('...')) return true; // Hindari "Enter ... to continue" yang cuma info

            return false;
        };

        const handleProcessActivity = (chunk: string) => {
            if (isInteractivePrompt(chunk)) {
                // BAHAYA: Terdeteksi ciri-ciri pertanyaan!
                // Pasang timer pendek (3 detik). Kalau beneran diem, berarti nunggu input.
                setKillTimer(3000);
            } else {
                // AMAN: Log biasa.
                if (isHeavyTool) {
                    // Tool berat? BIARKAN JALAN TERUS (Hapus Timer).
                    clearKillTimer();
                } else {
                    // Tool ringan? Reset ke 30 detik.
                    setKillTimer(DEFAULT_IDLE_TIMEOUT);
                }
            }
        };

        // Init timer awal
        if (!isHeavyTool) {
            setKillTimer(DEFAULT_IDLE_TIMEOUT);
        }

        const appendSafe = (chunk: string) => {
            if (isKilled) return;

            output += chunk;
            if (output.length >= MAX_BUFFER_SIZE) {
                child.kill('SIGKILL');
                isKilled = true;
                output = output.slice(0, MAX_BUFFER_SIZE) + '\n... [SECURITY/STABILITY KILL: OUTPUT TOO LARGE] ...';
            }
        };

        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            appendSafe(chunk);
            if (onOutput) onOutput(chunk);
            handleProcessActivity(chunk);
        });

        child.stderr.on('data', (data) => {
            const chunk = data.toString();
            appendSafe(chunk);
            isError = true;
            if (onOutput) onOutput(chunk);
            handleProcessActivity(chunk);
        });

        child.on('close', (code) => {
            if (timer) clearTimeout(timer);
            activeChildProcess = null;

            resolve({
                output: output.trim() || (code === 0 ? "Command executed successfully" : `Process exited with code ${code}`),
                isError: code !== 0 || isError || isKilled
            });
        });

        child.on('error', (err) => {
            if (timer) clearTimeout(timer);
            activeChildProcess = null;
            resolve({
                output: `Spawn error: ${err.message}`,
                isError: true
            });
        });
    });
}

// 2. ReadFile
export async function readFile({ path: filePath }: { path: string }): Promise<ToolResult> {
    try {
        const content = fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf-8');
        return { output: content, isError: false };
    } catch (error: any) {
        return { output: `Error reading file: ${error.message}`, isError: true };
    }
}

// 3. ListDirectory
export async function listDirectory({ path: dirPath = '.' }: { path?: string }): Promise<ToolResult> {
    try {
        const absPath = path.resolve(process.cwd(), dirPath);
        const entries = fs.readdirSync(absPath, { withFileTypes: true });
        const formatted = entries.map(entry => entry.isDirectory() ? entry.name + '/' : entry.name);
        return { output: formatted.join('\n'), isError: false };
    } catch (error: any) {
        return { output: `Error listing directory: ${error.message}`, isError: true };
    }
}

// 4. WriteFile
export async function writeFile({ path: filePath, content }: { path: string, content: string }): Promise<ToolResult> {
    try {
        const absPath = path.resolve(process.cwd(), filePath);
        const dir = path.dirname(absPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(absPath, content, 'utf8');
        return { output: `Successfully wrote to ${filePath}`, isError: false };
    } catch (error: any) {
        return { output: `Error writing file: ${error.message}`, isError: true };
    }
}

// 5. Glob
export async function glob({ pattern, path: searchPath = '.' }: { pattern: string, path?: string }): Promise<ToolResult> {
    try {
        const results: string[] = [];
        const baseDir = path.resolve(process.cwd(), searchPath);
        async function walk(dir: string) {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relPath = path.relative(process.cwd(), fullPath);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === '.git') continue;
                    await walk(fullPath);
                } else {
                    const regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
                    if (new RegExp(`^${regexPattern}$`).test(entry.name)) results.push(relPath);
                }
            }
        }
        await walk(baseDir);
        return { output: results.join('\n') || 'No files found', isError: false };
    } catch (error: any) {
        return { output: error.message, isError: true };
    }
}

// 6. SearchText
export async function searchText({ query, path: searchPath = '.' }: { query: string, path?: string }): Promise<ToolResult> {
    try {
        const results: string[] = [];
        const baseDir = path.resolve(process.cwd(), searchPath);
        async function walk(dir: string) {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relPath = path.relative(process.cwd(), fullPath);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === '.git') continue;
                    await walk(fullPath);
                } else {
                    try {
                        const content = await fs.promises.readFile(fullPath, 'utf8');
                        const lines = content.split('\n');
                        const matches = lines.map((line, idx) => line.includes(query) ? `${relPath}:${idx + 1}: ${line.trim()}` : null).filter(Boolean) as string[];
                        if (matches.length > 0) results.push(...matches.slice(0, 20));
                    } catch (e) { }
                }
            }
        }
        await walk(baseDir);
        return { output: results.join('\n') || 'No matches found', isError: false };
    } catch (error: any) {
        return { output: 'No matches found', isError: false };
    }
}

// 7. WebFetch
export async function webFetch({ url }: { url: string }): Promise<ToolResult> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Console)' }, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentType = res.headers.get('content-type') || '';
        if (/image|video|audio|pdf|zip/.test(contentType)) return { output: `[BINARY: ${contentType}]`, isError: false };
        const text = await res.text();
        return { output: text.slice(0, 15000), isError: false };
    } catch (error: any) {
        return { output: `Fetch error: ${error.message}`, isError: true };
    }
}

// 8. Replace
export async function replace({ path: filePath, oldText, newText }: { path: string, oldText: string, newText: string }): Promise<ToolResult> {
    try {
        const absPath = path.resolve(process.cwd(), filePath);
        const content = fs.readFileSync(absPath, 'utf8');
        if (!content.includes(oldText)) return { output: `Error: Text not found in ${filePath}`, isError: true };
        const updated = content.replace(oldText, newText); // Standard replace
        fs.writeFileSync(absPath, updated, 'utf8');
        return { output: `Successfully replaced text in ${filePath}`, isError: false };
    } catch (error: any) {
        return { output: `Replace error: ${error.message}`, isError: true };
    }
}

// 9. SaveMemory
export async function saveMemory({ info }: { info: string }): Promise<ToolResult> {
    try {
        const memoryDir = path.join(os.homedir(), '.voidex-cli');
        if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
        const memoryPath = path.join(memoryDir, 'memory.md');
        fs.appendFileSync(memoryPath, `\n- [${new Date().toLocaleString()}] ${info}`, 'utf8');
        return { output: `Knowledge saved to ${memoryPath}`, isError: false };
    } catch (error: any) {
        return { output: `Memory error: ${error.message}`, isError: true };
    }
}

// 10. WriteTodos
export async function writeTodos({ todos }: { todos: string[] }): Promise<ToolResult> {
    try {
        const todosPath = path.resolve(process.cwd(), 'TODO.md');
        const content = `# Project TODOs\n\n${todos.map(t => `- [ ] ${t}`).join('\n')}\n`;
        fs.writeFileSync(todosPath, content, 'utf8');
        return { output: `Updated ${todosPath}`, isError: false };
    } catch (error: any) {
        return { output: `Todos error: ${error.message}`, isError: true };
    }
}

// 11. GoogleSearch
export async function googleWebSearch({ query }: { query: string }): Promise<ToolResult> {
    return { output: `[NOTICE] Google API not configured. Use web_fetch to scrape results.`, isError: true };
}

// 12. Delegate
export async function delegateToAgent({ task }: { task: string }): Promise<ToolResult> {
    return { output: `[DELEGATION] Analyzing task: "${task}"`, isError: false };
}

export const toolsDefinition = [
    { type: 'function', function: { name: 'run_shell_command', description: 'Execute bash command', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
    { type: 'function', function: { name: 'read_file', description: 'Read file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'list_directory', description: 'List dir', parameters: { type: 'object', properties: { path: { type: 'string' } } } } },
    { type: 'function', function: { name: 'write_file', description: 'Write file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
    { type: 'function', function: { name: 'glob', description: 'Find files', parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } } },
    { type: 'function', function: { name: 'search_file_content', description: 'Grep files', parameters: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'web_fetch', description: 'Fetch URL', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
    { type: 'function', function: { name: 'replace', description: 'Replace text', parameters: { type: 'object', properties: { path: { type: 'string' }, oldText: { type: 'string' }, newText: { type: 'string' } }, required: ['path', 'oldText', 'newText'] } } },
    { type: 'function', function: { name: 'save_memory', description: 'Save info', parameters: { type: 'object', properties: { info: { type: 'string' } }, required: ['info'] } } },
    { type: 'function', function: { name: 'write_todos', description: 'Write TODOs', parameters: { type: 'object', properties: { todos: { type: 'array', items: { type: 'string' } } }, required: ['todos'] } } },
    { type: 'function', function: { name: 'google_web_search', description: 'Google Search', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'delegate_to_agent', description: 'Delegate task', parameters: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] } } }
];

export const toolRegistry: Record<string, Function> = {
    run_shell_command: runShellCommand, execute_bash: runShellCommand,
    read_file: readFile, list_directory: listDirectory, list_files: listDirectory,
    write_file: writeFile, glob: glob, find_files: glob,
    search_file_content: searchText, web_fetch: webFetch, replace: replace,
    save_memory: saveMemory, write_todos: writeTodos,
    google_web_search: googleWebSearch, delegate_to_agent: delegateToAgent
};
