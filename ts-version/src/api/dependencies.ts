import { BaseStrategy } from '../core/models';
import { strategyRegistry } from '../core/strategy-registry';
import { getDbPool } from '../db/session';
import { ChatGoogleGenerativeAI } from '../llm/providers/gemini';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { LanggraphStrategy } from '../core/strategies/langgraph/strategy';
import { logger } from '../config/logging';
import { config } from '../config/settings';

// Import strategy to trigger registration
import { buildFHIRGraph } from '../core/strategies/langgraph/graph';

/**
 * TypeScript vs Python Strategy Resolution:
 * 
 * TYPESCRIPT APPROACH:
 * - Uses BaseChatModel from LangChain for type safety and consistency
 * - Direct LangChain integration eliminates wrapper overhead
 * - Standardized interfaces across all LLM providers
 * - Matches admin project pattern for maintainability
 * 
 * PYTHON APPROACH:
 * - Uses custom BaseLLMClient interface for fine-grained control
 * - Direct Google AI API integration for optimal performance
 * - Custom wrapper allows specialized token counting and streaming
 * - Different architectural philosophy prioritizing explicit control
 */

export function resolveStrategy(strategyName: string): BaseStrategy {
  const factory = strategyRegistry.get(strategyName);
  if (!factory) {
    throw new Error(`Unknown strategy: ${strategyName}. Available: ${strategyRegistry.list().join(', ')}`);
  }

  // Create instances using direct LangChain ChatGoogleGenerativeAI
  const dbPool = getDbPool();
  const llmModel = new ChatGoogleGenerativeAI({
    apiKey: config.geminiApiKey,
    model: 'gemini-3.0-flash',
    temperature: 0.1,
    maxOutputTokens: 4000,
  }) as unknown as BaseChatModel; // Safe type assertion via unknown (matches admin project pattern)

  if (strategyName === 'langgraph') {
    return new LanggraphStrategy(dbPool, llmModel);
  }

  throw new Error(`Strategy ${strategyName} not implemented`);
}

// LLM model factory using standard LangChain approach
export function createLLMModel(provider: string, apiKey: string) {
  switch (provider) {
    case 'gemini':
      return new ChatGoogleGenerativeAI({
        apiKey,
        model: 'gemini-3.0-flash',
        temperature: 0.1,
        maxOutputTokens: 4000,
      });
    case 'openai':
      // TODO: Implement OpenAI model using LangChain
      throw new Error('OpenAI model not implemented yet');
    case 'anthropic':
      // TODO: Implement Anthropic model using LangChain
      throw new Error('Anthropic model not implemented yet');
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
