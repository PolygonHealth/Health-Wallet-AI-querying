// Test bindTools functionality
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const testTool = tool(
  async () => {
    return 'test result';
  },
  {
    name: 'test_tool',
    description: 'A test tool',
  }
);

async function testBindTools() {
  try {
    const model = new ChatGoogleGenerativeAI({
      apiKey: 'test-key',
      model: 'gemini-3.0-flash',
      temperature: 0.1,
      maxOutputTokens: 4000,
    });

    console.log('Model type:', typeof model);
    console.log('bindTools method:', typeof (model as any).bindTools);
    
    if (typeof (model as any).bindTools === 'function') {
      console.log('bindTools is available, trying to call it...');
      const modelWithTools = (model as any).bindTools([testTool]);
      console.log('bindTools successful');
    } else {
      console.log('bindTools is NOT available');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testBindTools();
