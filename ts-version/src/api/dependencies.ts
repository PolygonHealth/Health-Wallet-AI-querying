import { BaseStrategy } from '../core/models';
import { strategyRegistry } from '../core/strategy-registry';
import { getDbPool } from '../db/session';
import { createGeminiClient } from '../llm/providers/gemini';
import { LanggraphStrategy } from '../core/strategies/langgraph/strategy';
import { logger } from '../config/logging';
import { config } from '../config/settings';

// Import strategies to trigger registration
import '../core/strategies/langgraph'; // This will register the langgraph strategy

export function resolveStrategy(strategyName: string): BaseStrategy {
  const factory = strategyRegistry.get(strategyName);
  if (!factory) {
    throw new Error(`Unknown strategy: ${strategyName}. Available: ${strategyRegistry.list().join(', ')}`);
  }

  // For now, we'll create instances directly
  // In a more complex setup, you might use the factory pattern
  const dbPool = getDbPool();
  const llmClient = createGeminiClient(config.geminiApiKey);

  if (strategyName === 'langgraph') {
    return new LanggraphStrategy(dbPool, llmClient);
  }

  throw new Error(`Strategy ${strategyName} not implemented`);
}

// LLM client factory
export function createLLMClient(provider: string, apiKey: string) {
  switch (provider) {
    case 'gemini':
      return createGeminiClient(apiKey);
    case 'openai':
      // TODO: Implement OpenAI client
      throw new Error('OpenAI client not implemented yet');
    case 'anthropic':
      // TODO: Implement Anthropic client
      throw new Error('Anthropic client not implemented yet');
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
