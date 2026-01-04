import OpenAI from 'openai';

// Membuat instance OpenAI client yang diarahkan ke OpenRouter
export function createClient(apiKey: string) {
    return new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: apiKey,
        dangerouslyAllowBrowser: true, // Diperlukan untuk environment CLI/Ink
        defaultHeaders: {
            'HTTP-Referer': 'https://github.com/voidex369/voidex-cli',
            'X-Title': 'VoidEx CLI',
        }
    });
}

// [FIXED] Validator API Key
export async function validateApiKey(apiKey: string): Promise<boolean> {
    // 1. Cek format dasar
    if (!apiKey || apiKey.trim().length < 10) return false;

    try {
        // 2. Tembak endpoint auth
        const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        // 3. Analisa Respon
        if (response.status === 200) {
            // [FIX ERROR DISINI] Kita kasih 'as any' biar TypeScript gak rewel
            const data = (await response.json()) as any;

            // Cek apakah ada object 'data' di dalamnya
            return data && data.data ? true : false;
        }

        return false;

    } catch (error) {
        return false;
    }
}