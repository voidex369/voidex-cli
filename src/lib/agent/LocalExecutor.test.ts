import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalExecutor, ExecutorParams } from './LocalExecutor.js';
import { createClient } from '../openrouter.js';

// 1. MOCK DEPENDENCIES
vi.mock('../openrouter');
vi.mock('../tools', () => ({
    toolsDefinition: [],
    toolRegistry: {
        calculator: vi.fn().mockResolvedValue({ output: '42', isError: false })
    },
    killActiveProcess: vi.fn()
}));
vi.mock('../context', () => ({
    getSystemContext: () => 'System Context'
}));

// Helper buat bikin Stream Response palsu
async function* mockStreamGenerator(content: string, toolCalls?: any[]) {
    if (content) {
        yield { choices: [{ delta: { content } }] };
    }
    if (toolCalls) {
        yield { choices: [{ delta: { tool_calls: toolCalls } }] };
    }
}

describe('LocalExecutor (Otak AI)', () => {
    let executor: LocalExecutor;
    let mockOpenAI: any;

    beforeEach(() => {
        vi.resetAllMocks();
        executor = new LocalExecutor();

        mockOpenAI = {
            chat: {
                completions: {
                    create: vi.fn()
                }
            }
        };
        // @ts-ignore
        vi.mocked(createClient).mockReturnValue(mockOpenAI);
    });

    it('harus berhenti (DONE) jika AI tidak memanggil tool', async () => {
        mockOpenAI.chat.completions.create.mockResolvedValue(mockStreamGenerator('Halo user!'));

        const params: ExecutorParams = {
            model: 'gpt-4',
            apiKey: 'sk-test',
            // [FIX] Tambahkan ID di sini
            messages: [{ id: 'msg-1', role: 'user', content: 'Halo' }],
            allowedTools: [],
            onUpdateMessages: vi.fn(),
            onStatusUpdate: vi.fn(),
            onLiveOutput: vi.fn(),
            onNeedApproval: vi.fn().mockResolvedValue('allow'),
            onToolWhitelisted: vi.fn(),
            onError: vi.fn()
        };

        await executor.run(params);

        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
        expect(params.onStatusUpdate).toHaveBeenCalled();
        expect(params.onUpdateMessages).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ role: 'assistant', content: 'Halo user!' })
            ])
        );
    });

    it('harus mengeksekusi tool jika AI memintanya', async () => {
        const toolCallData = [{
            index: 0,
            id: 'call_123',
            type: 'function',
            function: { name: 'calculator', arguments: '{}' }
        }];

        mockOpenAI.chat.completions.create.mockReturnValueOnce(mockStreamGenerator('', toolCallData));
        mockOpenAI.chat.completions.create.mockReturnValueOnce(mockStreamGenerator('Hasilnya 42'));

        const params: ExecutorParams = {
            model: 'gpt-4',
            apiKey: 'sk-test',
            // [FIX] Tambahkan ID di sini juga
            messages: [{ id: 'msg-2', role: 'user', content: 'Hitung dong' }],
            allowedTools: ['calculator'],
            onUpdateMessages: vi.fn(),
            onStatusUpdate: vi.fn(),
            onLiveOutput: vi.fn(),
            onNeedApproval: vi.fn().mockResolvedValue('allow'),
            onToolWhitelisted: vi.fn(),
            onError: vi.fn()
        };

        await executor.run(params);

        expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
        expect(params.onStatusUpdate).toHaveBeenCalledWith('Executing calculator...');
    });
});