import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MemorySaver, StateGraph, START, END } from '@langchain/langgraph';
import { z } from 'zod';

import { GraphState, StateSchema, StreamEvent } from './state';
import { createFHIRTools } from './tools';
import { retryLLMCall } from '../utils/retry';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { config } from '../../../config/settings';
import { MAX_TURNS } from '../utils/constants';
import { logger } from '../../../config/logging';

// Custom tool messages mapping
const getToolMessage = (toolName: string): string => {
  const messageMap: Record<string, string> = {
    'get_patient_overview': 'Retrieving patient overview...',
    'get_resources_by_type': 'Fetching specific health data...',
    'search_resources_by_keyword': 'Searching health records...',
    'execute_sql': 'Analyzing health data...',
    'get_fhir_resources_schema_info': 'Loading health record schema...',
    'finish_with_answer': 'Finalizing your health analysis...'
  };
  return messageMap[toolName] || 'Processing health data...';
};

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

  // Create streaming tool node wrapper
  const streamingToolNode = async (state: GraphState) => {
    const { onEvent } = state;
    const lastMessage = state.messages[state.messages.length - 1];
    const toolCalls = (lastMessage as any)?.tool_calls || [];
    
    // Emit events for each tool call
    for (const toolCall of toolCalls) {
      if (onEvent) {
        let message: string;
        
        // Use switch for different tool messages
        switch (toolCall.function.name) {
          case 'get_patient_overview':
            message = 'Retrieving patient overview...';
            break;
          case 'get_resources_by_type':
            message = 'Fetching specific health data...';
            break;
          case 'search_resources_by_keyword':
            message = 'Searching health records...';
            break;
          case 'execute_sql':
            message = 'Analyzing health data...';
            break;
          case 'get_fhir_resources_schema_info':
            message = 'Loading health record schema...';
            break;
          case 'finish_with_answer':
            message = 'Finalizing your health analysis...';
            break;
          default:
            message = 'Processing health data...';
            break;
        }
        
        onEvent({
          type: 'tool_call',
          data: {
            toolName: toolCall.function.name,
            message
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    // Execute original tool node
    const result = await new ToolNode(tools).invoke(state);
    
    // Emit completion events
    if (onEvent && toolCalls.length > 0) {
      onEvent({
        type: 'tool_result',
        data: {
          message: 'Health data retrieval complete',
          toolCount: toolCalls.length
        },
        timestamp: new Date().toISOString()
      });
    }

    // Preserve onEvent callback in state
    return {
      ...result,
      onEvent
    };
  };

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
      onEvent: state.onEvent, // Preserve callback
    };
  };

  // Use correct LangChain.js syntax
  const workflow = new StateGraph(StateSchema)
    .addNode("llm", llmNode)
    .addNode("tools", streamingToolNode)
    .addEdge(START, "llm")
    .addEdge("tools", "llm")
    .addConditionalEdges("llm", routeAfterLLM);

  const compiled = workflow.compile({ checkpointer });
  logger.info(`fhir_graph_compiled | tools=${tools.length}`);
  return compiled;
}
