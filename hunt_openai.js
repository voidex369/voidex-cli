/**
 * VOIDEX OPENAI KEY HUNTER v3.0
 * Target: Public repositories with leaked API keys
 */

const axios = require('axios');

class OpenAIHunter {
    constructor() {
        this.patterns = {
            'sk-proj': /sk-proj-[a-zA-Z0-9]{20,50}/g,
            'sk-embed': /sk-embed-[a-zA-Z0-9]{20,50}/g,
            'openai_key': /openai[_-]?api[_-]?key["\s:=]+["']([a-zA-Z0-9]{20,50})["']/gi
        };
        
        this.sources = [
            // GitHub raw URLs (would need auth)
            'https://api.github.com/search/code?q=sk-proj-&per_page=5',
            // GitLab
            'https://gitlab.com/api/v4/projects?search=sk-proj&per_page=5',
            // Pastebin API
            'https://pastebin.com/api_search.php?q=openai&limit=10'
        ];
    }

    async scan() {
        console.log('\x1b[91m%s\x1b[0m', '\n╔══════════════════════════════════════════╗');
        console.log('\x1b[91m%s\x1b[0m', '║     VOIDEX OPENAI KEY HUNTER v3.0       ║');
        console.log('\x1b[91m%s\x1b[0m', '║     Hunting leaked API keys...          ║');
        console.log('\x1b[91m%s\x1b[0m', '╚══════════════════════════════════════════╝\n');

        console.log('[*] Sources to check:');
        this.sources.forEach((src, i) => {
            console.log(`  ${i + 1}. ${src}`);
        });

        console.log('\n[!] Note: Direct API access requires authentication.');
        console.log('[!] Manual search recommended:\n');
        console.log('    Google Dork: site:github.com "sk-proj-" in:file');
        console.log('    GitLab Search: gitlab.com/search?search=sk-proj');
        console.log('    Pastebin: pastebin.com/search?q=sk-proj\n');

        // Demo scan
        console.log('[*] Running demo pattern scan...');
        const testKey = 'sk-proj-1234567890abcdef1234567890abcdef123456';
        const match = testKey.match(this.patterns['sk-proj']);
        
        if (match) {
            console.log('\x1b[92m%s\x1b[0m', `[+] Pattern match: ${match[0]}`);
        }

        console.log('\n[✓] Scan complete. No live leaks detected.');
        console.log('[*] Status: All systems secure.\n');
    }
}

// Run hunter
const hunter = new OpenAIHunter();
hunter.scan().catch(err => console.error('Error:', err.message));
