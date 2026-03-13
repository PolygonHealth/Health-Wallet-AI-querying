import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseLLMClient, LLMResponse } from '../../core/models';

export class GeminiClient implements BaseLLMClient {
  readonly modelId: string;
  private model: BaseChatModel;

  constructor(apiKey: string, modelId: string = 'gemini-3.0-flash') {
    this.modelId = modelId;
    this.model = new ChatGoogleGenerativeAI({
      apiKey,
      model: modelId,
      temperature: 0.1,
      maxOutputTokens: 4000,
    });
  }

  async generateWithTools(params: {
    contents: any[];
    tools: any[];
    maxTokens: number;
    temperature: number;
    useTools: boolean;
  }): Promise<LLMResponse> {
    try {
      const response = await this.model.invoke(params.contents[0].content);
      
      return {
        text: response.content as string,
        usage: {
          inputTokens: 0, // TODO: Extract actual token usage
          outputTokens: 0,
        },
        functionCalls: (response as any).tool_calls || [],
        rawModelContent: response,
      };
    } catch (error) {
      throw new Error(`Gemini API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function createGeminiClient(apiKey: string, modelId?: string): GeminiClient {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }
  return new GeminiClient(apiKey, modelId);
}
