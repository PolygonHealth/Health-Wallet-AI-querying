"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiClient = void 0;
exports.createGeminiClient = createGeminiClient;
const google_genai_1 = require("@langchain/google-genai");
class GeminiClient {
    constructor(apiKey, modelId = 'gemini-3.0-flash') {
        this.modelId = modelId;
        this.model = new google_genai_1.ChatGoogleGenerativeAI({
            apiKey,
            model: modelId,
            temperature: 0.1,
            maxOutputTokens: 4000,
        });
    }
    async generateWithTools(params) {
        try {
            const response = await this.model.invoke(params.contents[0].content);
            return {
                text: response.content,
                usage: {
                    inputTokens: 0, // TODO: Extract actual token usage
                    outputTokens: 0,
                },
                functionCalls: response.tool_calls || [],
                rawModelContent: response,
            };
        }
        catch (error) {
            throw new Error(`Gemini API error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.GeminiClient = GeminiClient;
function createGeminiClient(apiKey, modelId) {
    if (!apiKey) {
        throw new Error('Gemini API key is required');
    }
    return new GeminiClient(apiKey, modelId);
}
//# sourceMappingURL=gemini.js.map