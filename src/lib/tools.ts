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

// 1. Shell / run_shell_command (Hardened)
export async function runShellCommand({ command, onOutput }: { command: string, onOutput?: StreamCallback }): Promise<ToolResult> {
    return new Promise((resolve) => {
        // [Task A] Shell fallback: Check for bash, otherwise sh
        let shell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash';
        if (os.platform() !== 'win32' && !fs.existsSync('/bin/bash')) {
            shell = '/bin/sh';
        }

        const shellArgs = os.platform() === 'win32' ? ['/c', command] : ['-c', command];

        const child = spawn(shell, shellArgs);
        activeChildProcess = child;

        const MAX_BUFFER_SIZE = 50000;
        let output = '';
        let isError = false;
        let isKilled = false;

        const appendSafe = (chunk: string) => {
            if (isKilled) return;

            output += chunk;
            if (output.length >= MAX_BUFFER_SIZE) {
                // [Task A] Kill process immediately on OOM
                child.kill('SIGKILL');
                isKilled = true;
                output = output.slice(0, MAX_BUFFER_SIZE) + '\n... [SECURITY/STABILITY KILL: OUTPUT TOO LARGE] ...';
            }
        };

        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            appendSafe(chunk);
            if (onOutput) onOutput(chunk);
        });

        child.stderr.on('data', (data) => {
            const chunk = data.toString();
            appendSafe(chunk);
            isError = true;
            if (onOutput) onOutput(chunk);
        });

        child.on('close', (code) => {
            activeChildProcess = null;
            resolve({
                output: output.trim() || (code === 0 ? "Command executed successfully" : `Process exited with code ${code}`),
                isError: code !== 0 || isError || isKilled
            });
        });

        child.on('error', (err) => {
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

// 3. ReadFolder / list_directory
export async function listDirectory({ path: dirPath = '.' }: { path?: string }): Promise<ToolResult> {
    try {
        const absPath = path.resolve(process.cwd(), dirPath);
        const entries = fs.readdirSync(absPath, { withFileTypes: true });

        // [Task E] Add / suffix to directories
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
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(absPath, content, 'utf8');
        return { output: `Successfully wrote to ${filePath}`, isError: false };
    } catch (error: any) {
        return { output: `Error writing file: ${error.message}`, isError: true };
    }
}

// 5. FindFiles / glob (Native Node implementation for Windows/Linux/macOS)
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
                    // [Task F] Advanced Glob matching supporting recursive ** and braces
                    const regexPattern = pattern
                        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex chars
                        .replace(/\\\{/g, '{').replace(/\\\}/g, '}') // Keep braces
                        .replace(/\{([^{}]+)\}/g, (_, group) => `(${group.replace(/,/g, '|')})`) // Braces {a,b} -> (a|b)
                        .replace(/\*\*\//g, '(.+/)?')         // ** matches nested dirs
                        .replace(/\*/g, '[^/]+')              // * matches file chars
                        .replace(/\?/g, '.');                 // ? matches single char

                    const matcher = new RegExp(`^${regexPattern}$`);

                    if (matcher.test(relPath) || matcher.test(entry.name)) {
                        results.push(relPath);
                    }
                }
            }
        }

        await walk(baseDir);
        return { output: results.join('\n') || 'No files found', isError: false };
    } catch (error: any) {
        return { output: error.message, isError: true };
    }
}

// 6. SearchText / search_file_content (Native Node implementation for Windows/Linux/macOS)
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
                        const matches = lines
                            .map((line, idx) => line.includes(query) ? `${relPath}:${idx + 1}: ${line.trim()}` : null)
                            .filter(Boolean) as string[];

                        // [Task D] Return ALL matches, limit to 20 per file
                        if (matches.length > 0) {
                            results.push(...matches.slice(0, 20));
                        }
                    } catch (e) {
                        // Skip binary or unreadable files
                    }
                }
            }
        }

        await walk(baseDir);
        return { output: results.join('\n') || 'No matches found', isError: false };
    } catch (error: any) {
        return { output: 'No matches found', isError: false };
    }
}

// 7. WebFetch (Defensive Binary Handling)
export async function webFetch({ url }: { url: string }): Promise<ToolResult> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // [Task C] Binary detection
        const contentType = res.headers.get('content-type') || '';
        const isBinary = /image|video|audio|pdf|zip|octet-stream/.test(contentType);

        if (isBinary) {
            const contentLength = res.headers.get('content-length') || 'unknown';
            return {
                output: `[BINARY DATA OMITTED - Type: ${contentType}, Size: ${contentLength} bytes]`,
                isError: false
            };
        }

        const text = await res.text();
        return { output: text.slice(0, 15000), isError: false };
    } catch (error: any) {
        return { output: `Fetch error: ${error.name === 'AbortError' ? 'Timeout' : error.message}`, isError: true };
    }
}

// 8. Edit / replace (Safe Line-Based Implementation)
export async function replace({ path: filePath, oldText, newText }: { path: string, oldText: string, newText: string }): Promise<ToolResult> {
    try {
        const absPath = path.resolve(process.cwd(), filePath);
        const content = fs.readFileSync(absPath, 'utf8');

        // [Task B] Defensive Replacement Strategy
        const occurrences = content.split(oldText).length - 1;

        if (occurrences === 0) {
            // Try line-based fuzzy fallback for small differences
            const lines = content.split('\n');
            const oldLines = oldText.split('\n');

            for (let i = 0; i <= lines.length - oldLines.length; i++) {
                let match = true;
                for (let j = 0; j < oldLines.length; j++) {
                    // NO normalisasi whitespace for code projects (Task B)
                    // But we can trim trailing space just in case
                    if (lines[i + j].trimEnd() !== oldLines[j].trimEnd()) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    lines.splice(i, oldLines.length, newText);
                    fs.writeFileSync(absPath, lines.join('\n'), 'utf8');
                    return { output: `Successfully applied fuzzy-line replacement in ${filePath}`, isError: false };
                }
            }
            return { output: `Error: Text not found in ${filePath}. Check for exact content including indentation.`, isError: true };
        }

        if (occurrences > 1) {
            return {
                output: `Error: Ambiguous replacement. Found ${occurrences} occurrences of the target text. Please provide a more specific block to replace.`,
                isError: true
            };
        }

        // Exact match replacement (Task B: Global replace disabled logically by check above)
        const updated = content.replace(oldText, newText);
        fs.writeFileSync(absPath, updated, 'utf8');
        return { output: `Successfully replaced exact match in ${filePath}`, isError: false };
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
        return { output: `Knowledge successfully integrated into sovereign memory: ${memoryPath}`, isError: false };
    } catch (error: any) {
        return { output: `Memory error: ${error.message}`, isError: true };
    }
}

// 10. WriteTodos
export async function writeTodos({ todos }: { todos: string[] }): Promise<ToolResult> {
    try {
        const todosPath = path.resolve(process.cwd(), 'TODO.md');
        const content = `# Project TODOs (Updated ${new Date().toLocaleString()})\n\n${todos.map(t => `- [ ] ${t}`).join('\n')}\n`;
        fs.writeFileSync(todosPath, content, 'utf8');
        return { output: `Sovereign objectives updated in ${todosPath}`, isError: false };
    } catch (error: any) {
        return { output: `Todos error: ${error.message}`, isError: true };
    }
}

// 11. GoogleSearch
export async function googleWebSearch({ query }: { query: string }): Promise<ToolResult> {
    return {
        output: `[NOTICE] Direct Google Search API not configured. 
STRATEGY: Use 'web_fetch' tool with 'https://duckduckgo.com/html/?q=${encodeURIComponent(query)}' to scrape results manually.`,
        isError: true
    };
}

// 12. DelegateToAgent (Strategic Thinking)
export async function delegateToAgent({ task }: { task: string }): Promise<ToolResult> {
    return {
        output: `[DELEGATION] Strategic analysis for: "${task}" 
The agent will now internalize this sub-goal and prioritize it in the next thinking cycle.`,
        isError: false
    };
}

export const toolsDefinition = [
    {
        type: 'function',
        function: {
            name: 'run_shell_command',
            description: 'Execute a bash command on the system',
            parameters: {
                type: 'object',
                properties: { command: { type: 'string', description: 'The shell command to execute' } },
                required: ['command'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read the contents of a file',
            parameters: {
                type: 'object',
                properties: { path: { type: 'string', description: 'Path to file' } },
                required: ['path'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_directory',
            description: 'List items in a directory',
            parameters: {
                type: 'object',
                properties: { path: { type: 'string', description: 'Directory path (default: .)' } },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Write content to a file (overwrites existing)',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path' },
                    content: { type: 'string', description: 'Content to write' }
                },
                required: ['path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'glob',
            description: 'Find files matching a pattern (e.g. *.ts)',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Search pattern' },
                    path: { type: 'string', description: 'Search path (default: .)' }
                },
                required: ['pattern']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_file_content',
            description: 'Search for text in files (grep)',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Text to search' },
                    path: { type: 'string', description: 'Search path (default: .)' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'web_fetch',
            description: 'Fetch content from a URL',
            parameters: {
                type: 'object',
                properties: { url: { type: 'string', description: 'URL to fetch' } },
                required: ['url']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'replace',
            description: 'Replace text in a file (Simple Edit)',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path' },
                    oldText: { type: 'string', description: 'Text to find' },
                    newText: { type: 'string', description: 'Text to replace with' }
                },
                required: ['path', 'oldText', 'newText']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'save_memory',
            description: 'Save key knowledge or progress for future reference',
            parameters: {
                type: 'object',
                properties: { info: { type: 'string', description: 'Information to remember' } },
                required: ['info']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_todos',
            description: 'Update the project TODO.md list',
            parameters: {
                type: 'object',
                properties: { todos: { type: 'array', items: { type: 'string' }, description: 'List of todo items' } },
                required: ['todos']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'google_web_search',
            description: 'Perform a web search',
            parameters: {
                type: 'object',
                properties: { query: { type: 'string', description: 'Search query' } },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delegate_to_agent',
            description: 'Delegate a complex task to a sub-thinking process',
            parameters: {
                type: 'object',
                properties: { task: { type: 'string', description: 'Task to delegate' } },
                required: ['task']
            }
        }
    }
];

export const toolRegistry: Record<string, Function> = {
    run_shell_command: runShellCommand,
    execute_bash: runShellCommand, // Alias
    read_file: readFile,
    list_directory: listDirectory,
    list_files: listDirectory, // Alias
    write_file: writeFile,
    glob: glob,
    find_files: glob, // Alias
    search_file_content: searchText,
    web_fetch: webFetch,
    replace: replace,
    save_memory: saveMemory,
    write_todos: writeTodos,
    google_web_search: googleWebSearch,
    delegate_to_agent: delegateToAgent
};
