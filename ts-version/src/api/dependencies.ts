import { BaseStrategy } from '../core/models';
import { strategyRegistry } from '../core/strategy-registry';
import { getDbPool } from '../db/session';
//import { ChatGoogle } from '@langchain/google';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { LanggraphStrategy } from '../core/strategies/langgraph/strategy';
import { logger } from '../config/logging';
import { config } from '../config/settings';

// Import strategy to trigger registration
//import { buildFHIRGraph } from '../core/strategies/langgraph/graph';
import '../core/strategies/langgraph'; // Import index to trigger factory registration
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

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

// Strategy instance caching (following Python pattern: cache by strategy_name + model_id)
const strategyCache = new Map<string, BaseStrategy>();

// Generic LLM creation method (matching Python v1 changes)
export function createLLM(provider: string, apiKey: string, options?: {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}): BaseChatModel {
  switch (provider) {
    case 'gemini':
      // const llm = new ChatGoogle({
      //   apiKey,
      //   model: options?.model || 'gemini-2.5-flash',
      //   temperature: options?.temperature || 0.0,
      //   maxOutputTokens: options?.maxOutputTokens || 8192,
      // });
      const llm = new ChatGoogleGenerativeAI({
  model: options?.model || config.DEFAULT_MODEL,
  apiKey: config.GEMINI_API_KEY,
});
      return llm;
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

// export function resolveStrategy(strategyName: string): BaseStrategy {
//   // Follow Python pattern: cache strategy instances by (strategy_name, model_id)
//   const modelId = 'gemini-3.0-flash'; // Hardcoded for now, like Python
//   const cacheKey = `${strategyName}-${modelId}`;
  
//   // Check cache first
//   if (strategyCache.has(cacheKey)) {
//     logger.info(`Using cached strategy for ${strategyName} with model ${modelId}`);
//     return strategyCache.get(cacheKey)!;
//   }

//   // Try factory function first (explicit registration)
//   const factory = strategyRegistry.get(strategyName);
//   if (factory) {
//     logger.info(`Creating new strategy ${strategyName} from factory function`);
//     const strategy = factory();
//     strategyCache.set(cacheKey, strategy);
//     logger.info(`Cached strategy for ${strategyName} with model ${modelId}`);
//     return strategy;
//   }

//   // Try class constructor (decorator registration)
//   const StrategyClass = strategyRegistry.getClass(strategyName);
//   if (StrategyClass) {
//     logger.info(`Creating new strategy ${strategyName} from class constructor`);
//     const dbPool = getDbPool();
//     const llmModel = createLLM('gemini', config.geminiApiKey);
//     const strategy = new StrategyClass(dbPool, llmModel);
//     strategyCache.set(cacheKey, strategy);
//     logger.info(`Cached strategy for ${strategyName} with model ${modelId}`);
//     return strategy;
//   }

//   throw new Error(`Unknown strategy: ${strategyName}. Available: ${strategyRegistry.list().join(', ')}`);
// }
export function resolveStrategy(strategyName: string, sessionFactory: any, modelId: string): BaseStrategy {
  // Match Python: cache by (strategy_name, model_id) tuple
  const cacheKey = `${strategyName}-${modelId}`;
  
  // Check cache first (exact Python match)
  if (strategyCache.has(cacheKey)) {
    return strategyCache.get(cacheKey)!;
  }

  // Get strategy class (match Python: get_strategy_class)
  const StrategyClass = strategyRegistry.getClass(strategyName);
  if (!StrategyClass) {
    throw new Error(`Unknown strategy: ${strategyName}. Available: ${strategyRegistry.list().join(', ')}`);
  }
  
  // Create LLM (match Python: create_llm)
  const llm = createLLM('gemini', config.GEMINI_API_KEY, { model: modelId });
  
  // Create strategy instance (match Python: strategy_cls(session_factory=session_factory, llm=llm))
  const strategy = new StrategyClass(sessionFactory, llm);
  
  // Cache and return (match Python: _strategy_cache[key] = strategy)
  strategyCache.set(cacheKey, strategy);
  
  return strategy;
}
// LLM model factory using standard LangChain approach (legacy)
export function createLLMModel(provider: string, apiKey: string) {
  return createLLM(provider, apiKey);
}
