//import { ChatGoogle } from '@langchain/google';

/**
 * TypeScript vs Python LLM Integration Strategy:
 * 
 * WHY TYPESCRIPT USES LANGCHAIN DIRECTLY:
 * - TypeScript ecosystem has excellent LangChain integration with full type safety
 */

/**
 * Export ChatGoogle for convenient direct usage.
 * 
 * Usage: new ChatGoogle({ model: 'gemini-2.5-flash' })
 */
//export { ChatGoogle };

/**
 * Legacy factory functions for backward compatibility.
 * 
 * @deprecated Use `new ChatGoogle({...})` directly instead.
 *             These functions are kept for backward compatibility but should not be used in new code.
 *             The custom wrapper approach has been replaced with direct LangChain integration.
 */
// export function createGeminiModel(apiKey: string, modelId: string = 'gemini-2.5-flash'): BaseChatModel {
//   if (!apiKey) {
//     throw new Error('Gemini API key is required');
//   }
//   return new ChatGoogle({
//     apiKey,
//     model: modelId,
//     temperature: 0.1,
//     maxOutputTokens: 4000,
//   });
// }

// export function createGeminiClient(apiKey: string, modelId?: string): BaseChatModel {
//   return createGeminiModel(apiKey, modelId);
// }
