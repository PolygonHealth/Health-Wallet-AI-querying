import { BaseLLMClient, LLMResponse } from '../../core/models';
export declare class GeminiClient implements BaseLLMClient {
    readonly modelId: string;
    private model;
    constructor(apiKey: string, modelId?: string);
    generateWithTools(params: {
        contents: any[];
        tools: any[];
        maxTokens: number;
        temperature: number;
        useTools: boolean;
    }): Promise<LLMResponse>;
}
export declare function createGeminiClient(apiKey: string, modelId?: string): GeminiClient;
//# sourceMappingURL=gemini.d.ts.map