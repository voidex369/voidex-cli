import OpenAI from 'openai';

export function createClient(apiKey: string) {
    return new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
            'HTTP-Referer': 'https://github.com/voidex369/voidex-cli',
            'X-Title': 'VoidEx CLI',
        }
    });
}
