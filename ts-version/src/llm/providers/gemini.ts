import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

/**
 * TypeScript vs Python LLM Integration Strategy:
 * 
 * WHY TYPESCRIPT USES LANGCHAIN DIRECTLY:
 * - TypeScript ecosystem has excellent LangChain integration with full type safety
 * - LangChain provides standardized interfaces (BaseChatModel) across all providers
 * - Built-in support for streaming, callbacks, token counting, and tool binding
 * - Matches admin project pattern and eliminates custom wrapper overhead
 * - No need for custom abstraction layers when LangChain handles everything
 * 
 * WHY PYTHON USES DIRECT GOOGLE AI API:
 * - Python's google-generativeai library provides native, optimized integration
 * - More control over low-level API interactions and streaming
 * - Python ecosystem favors direct library usage over heavy abstractions
 * - Custom implementation allows fine-tuned control over token usage and responses
 * - Different architectural philosophy: Python prefers explicit control
 */

/**
 * Export ChatGoogleGenerativeAI for convenient direct usage.
 * 
 * Usage: new ChatGoogleGenerativeAI({ apiKey: '...', model: 'gemini-3.0-flash' })
 */
export { ChatGoogleGenerativeAI };

/**
 * Legacy factory functions for backward compatibility.
 * 
 * @deprecated Use `new ChatGoogleGenerativeAI({...})` directly instead.
 *             These functions are kept for backward compatibility but should not be used in new code.
 *             The custom wrapper approach has been replaced with direct LangChain integration.
 */
// export function createGeminiModel(apiKey: string, modelId: string = 'gemini-3.0-flash'): BaseChatModel {
//   if (!apiKey) {
//     throw new Error('Gemini API key is required');
//   }
//   return new ChatGoogleGenerativeAI({
//     apiKey,
//     model: modelId,
//     temperature: 0.1,
//     maxOutputTokens: 4000,
//   });
// }

// export function createGeminiClient(apiKey: string, modelId?: string): BaseChatModel {
//   return createGeminiModel(apiKey, modelId);
// }
