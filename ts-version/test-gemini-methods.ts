// Test Gemini model methods
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

async function testGeminiMethods() {
  const model = new ChatGoogleGenerativeAI({
    apiKey: 'test-key',
    model: 'gemini-3.0-flash',
    temperature: 0.1,
    maxOutputTokens: 4000,
  });

  console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(model)));
  console.log('Model methods:', Object.getOwnPropertyNames(model));
  
  // Check for alternative tool binding methods
  console.log('has bind:', typeof (model as any).bind);
  console.log('has bindTools:', typeof (model as any).bindTools);
  console.log('has withTools:', typeof (model as any).withTools);
  console.log('has withStructuredOutput:', typeof (model as any).withStructuredOutput);
}

testGeminiMethods();
