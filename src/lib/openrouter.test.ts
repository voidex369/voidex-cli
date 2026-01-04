import { describe, it, expect, vi } from 'vitest';
import { createClient } from './openrouter';
import OpenAI from 'openai';

// 🎭 MOCKING: Bajak library OpenAI
// Biar dia gak connect internet beneran
vi.mock('openai');

describe('OpenRouter Client', () => {
    it('harus membuat instance OpenAI dengan config OpenRouter', () => {
        const fakeKey = 'sk-12345';
        
        createClient(fakeKey);

        // Kita intip: Apakah class OpenAI dipanggil?
        expect(OpenAI).toHaveBeenCalledTimes(1);

        // Kita intip: Parameter apa yang dikirim pas inisialisasi?
        // @ts-ignore - Mengakses mock call arguments
        const configYangDikirim = OpenAI.mock.calls[0][0];

        expect(configYangDikirim).toMatchObject({
            apiKey: fakeKey,
            baseURL: 'https://openrouter.ai/api/v1', // Sesuai file openrouter.ts kamu
            defaultHeaders: {
                'X-Title': 'VoidEx CLI'
            }
        });
    });
});
