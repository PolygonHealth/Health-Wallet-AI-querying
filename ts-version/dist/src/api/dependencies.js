"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveStrategy = resolveStrategy;
exports.createLLMClient = createLLMClient;
const strategy_registry_1 = require("../core/strategy-registry");
const session_1 = require("../db/session");
const gemini_1 = require("../llm/providers/gemini");
const strategy_1 = require("../core/strategies/langgraph/strategy");
const settings_1 = require("../config/settings");
// Import strategies to trigger registration
require("../core/strategies/langgraph"); // This will register the langgraph strategy
function resolveStrategy(strategyName) {
    const factory = strategy_registry_1.strategyRegistry.get(strategyName);
    if (!factory) {
        throw new Error(`Unknown strategy: ${strategyName}. Available: ${strategy_registry_1.strategyRegistry.list().join(', ')}`);
    }
    // For now, we'll create instances directly
    // In a more complex setup, you might use the factory pattern
    const dbPool = (0, session_1.getDbPool)();
    const llmClient = (0, gemini_1.createGeminiClient)(settings_1.config.geminiApiKey);
    if (strategyName === 'langgraph') {
        return new strategy_1.LanggraphStrategy(dbPool, llmClient);
    }
    throw new Error(`Strategy ${strategyName} not implemented`);
}
// LLM client factory
function createLLMClient(provider, apiKey) {
    switch (provider) {
        case 'gemini':
            return (0, gemini_1.createGeminiClient)(apiKey);
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
//# sourceMappingURL=dependencies.js.map