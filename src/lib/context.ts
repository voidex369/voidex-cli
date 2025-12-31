import os from 'os';
import path from 'path';
import fs from 'fs';

export function getSystemContext(): string {
    const cwd = process.cwd();
    const platform = os.platform();
    const release = os.release();
    const homedir = os.homedir();
    const shell = process.env.SHELL || (platform === 'win32' ? 'cmd.exe' : '/bin/bash');

    const memoryPath = path.join(homedir, '.voidex-cli', 'memory.md');
    let memory = 'None';
    if (fs.existsSync(memoryPath)) {
        try {
            memory = fs.readFileSync(memoryPath, 'utf-8');
        } catch (e) { }
    }

    return `OS: ${platform} ${release}
Home: ${homedir}
CWD: ${cwd}
Shell: ${shell}
Date: ${new Date().toLocaleString()}

[SOVEREIGN MEMORY]
${memory}

You are running in a sovereign CLI environment. 
You have access to the file system at '${cwd}'.`.trim();
}
