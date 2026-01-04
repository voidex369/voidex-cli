export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
}

export interface PendingToolCall {
    tool_call_id: string;
    name: string;
    arguments: any;
    // [BARU] Sistem Klasifikasi Risiko
    riskLevel?: 'safe' | 'caution' | 'critical';
    challengeCode?: string;
}

export interface AgentConfig {
    model: string;
    maxContext: number;
    iterationLimit: number;
}