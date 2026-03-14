// Export the LangGraph strategy to enable module import
export { LanggraphStrategy } from './strategy';
export { buildFHIRGraph } from './graph';
export { createFHIRTools } from './tools';

// Import and register the strategy
import { strategyRegistry } from '../../strategy-registry';
import { LanggraphStrategy } from './strategy';
import { getDbPool } from '../../../db/session';
import { ChatGoogleGenerativeAI } from '../../../llm/providers/gemini';
import { config } from '../../../config/settings';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

// Register the LangGraph strategy
strategyRegistry.register('langgraph', () => {
  const dbPool = getDbPool();
  const llmModel = new ChatGoogleGenerativeAI({
    apiKey: config.geminiApiKey,
    model: 'gemini-3.0-flash',
    temperature: 0.1,
    maxOutputTokens: 4000,
  }) as unknown as BaseChatModel; // Type assertion matches admin project pattern
  return new LanggraphStrategy(dbPool, llmModel);
});
