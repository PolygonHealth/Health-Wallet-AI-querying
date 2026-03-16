import { ChatGoogleGenerativeAI } from './src/llm/providers/gemini';
import { config } from './src/config/settings';
import { createFHIRTools } from './src/core/strategies/langgraph/tools';
import { getDbPool } from './src/db/session';

async function debugBindTools() {
  try {
    console.log('Creating LLM...');
    const llm = new ChatGoogleGenerativeAI({
      apiKey: config.geminiApiKey,
      model: 'gemini-3.0-flash',
      temperature: 0.1,
      maxOutputTokens: 4000,
    }) as any;
    
    console.log('LLM type:', typeof llm);
    console.log('LLM constructor:', llm.constructor.name);
    console.log('bindTools method exists:', typeof llm.bindTools);
    console.log('bind method exists:', typeof llm.bind);
    
    console.log('Creating tools...');
    const dbPool = getDbPool();
    const tools = createFHIRTools(dbPool);
    console.log('Tools created:', tools.length);
    
    console.log('Calling bindTools...');
    const llmWithTools = llm.bindTools(tools);
    console.log('bindTools successful!');
    
  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
  }
}

debugBindTools().catch(console.error);
