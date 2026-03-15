import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MemorySaver, StateGraph, START, END } from '@langchain/langgraph';
import { z } from 'zod';

import { GraphState, StateSchema } from './state';
import { createFHIRTools } from './tools';
import { retryLLMCall } from '../utils/retry';
//import { ChatGoogle } from '@langchain/google';
import { config } from '../../../config/settings';
import { MAX_TURNS } from '../utils/constants';
import { logger } from '../../../config/logging';
import { GoogleGenAI } from '@google/genai';

function extractUsage(usage: any, response: AIMessage, llm: BaseChatModel, messages: any[], tools: any[]): [number, number] {
  let deltaIn = 0;
  let deltaOut = 0;

  if (usage !== null) {
    if (typeof usage === 'object' && !Array.isArray(usage)) {
      deltaIn = usage.input_tokens || usage.input_token_count || usage.prompt_token_count || 0;
      deltaOut = usage.output_tokens || usage.output_token_count || usage.candidates_token_count || 0;
    }
  }

  if (deltaIn === 0 && deltaOut === 0) {
    try {
      if ((llm as any).get_num_tokens_from_messages) {
        deltaIn = (llm as any).get_num_tokens_from_messages(messages, { tools });
      }
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content || '');
      deltaOut = (llm as any).get_num_tokens ? (llm as any).get_num_tokens(content) : 0;
    } catch (error) {
      logger.warning('failed_to_extract_token_usage', { error: String(error) });
    }
  }

  return [deltaIn, deltaOut];
}

function routeAfterLLM(state: GraphState): string {
  // Use TypeScript LangGraph constants
  if (state.turnCount >= MAX_TURNS) {
    return END;
  }

  const messages = state.messages || [];
  if (!messages.length) {
    return END;
  }

  const last = messages[messages.length - 1];
  if (last instanceof AIMessage && last.tool_calls && last.tool_calls.length > 0) {
    return "tools";
  }

  return END;
}

export function buildFHIRGraph(
  dbPool: any,
  llm: BaseChatModel,
  checkpointer?: MemorySaver
): any {
  if (!checkpointer) {
    checkpointer = new MemorySaver();
  }

  const tools = createFHIRTools(dbPool);

  // Mirror Python: direct tool binding (no fallback logic)
  const toolNode = new ToolNode(tools);

  // // DEBUG: Create LLM directly to test bindTools
  // const debugLlm = new ChatGoogle({
  //   model: 'gemini-2.5-flash',
  //   temperature: 0.0,
  //   maxOutputTokens: 8192,
  // });

  // console.log('=== DEBUG INFO ===');
  // console.log('Original LLM type:', typeof llm);
  // console.log('Original LLM constructor:', llm?.constructor?.name);
  // console.log('Original bindTools exists:', typeof llm?.bindTools);
  // console.log('Debug LLM type:', typeof debugLlm);
  // console.log('Debug LLM constructor:', debugLlm.constructor.name);
  // console.log('Debug bindTools exists:', typeof debugLlm.bindTools);
  // console.log('==================');

  if (!llm || !llm.bindTools) {
    throw new Error('LLM is required');
  }
  const llmWithTools = llm.bindTools(tools);

  const llmNode = async (state: GraphState) => {
    // Mirror Python: simple state access without Zod validation
    const messages = state.messages || [];

    const response = await retryLLMCall(
      async () => {
        //test
        // const client = new GoogleGenAI({
        //   apiKey: 'AIzaSyDLqfLypdIeBRNrmlzapD_-GxjKtAvA578',
        // });

        // const result = await client.models.generateContent({
        //   model: "gemini-2.5-flash",
        //   contents: "Say hello",
        // });
        return llmWithTools.invoke(messages)
      }, // Mirror Python: ainvoke
      'llm_node'
    );

    const usage = (response as any).usage_metadata;
    const [deltaIn, deltaOut] = extractUsage(usage, response, llm, messages, tools);

    return {
      messages: [response],
      turnCount: (state.turnCount || 0) + 1,
      tokensIn: (state.tokensIn || 0) + deltaIn,
      tokensOut: (state.tokensOut || 0) + deltaOut,
    };
  };

  // Use correct LangChain.js syntax
  const workflow = new StateGraph(StateSchema)
    .addNode("llm", llmNode)
    .addNode("tools", toolNode)
    .addEdge(START, "llm")
    .addEdge("tools", "llm")
    .addConditionalEdges("llm", routeAfterLLM);

  const compiled = workflow.compile({ checkpointer });
  logger.info(`fhir_graph_compiled | tools=${tools.length}`);
  return compiled;
}
