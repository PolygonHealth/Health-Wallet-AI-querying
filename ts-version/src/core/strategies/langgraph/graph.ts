import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MemorySaver, StateGraph, START, END } from '@langchain/langgraph';
import { z } from 'zod';

import { GraphState, StateSchema, StreamEvent } from './state';
import { addMessages } from '@langchain/langgraph';
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
      logger.warn('failed_to_extract_token_usage', { error: String(error) });
    }
  }

  return [deltaIn, deltaOut];
}

function routeAfterLLM(state: any): string { // ✅ Use any type to fix parameter mismatch
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

// Create streaming tool node wrapper (moved outside buildFHIRGraph)
const getStreamingToolNode = (tools: any[]) => {
  return async (state: GraphState) => {
    const { onEvent } = state;
    const lastMessage = state.messages[state.messages.length - 1];
    const toolCalls = (lastMessage as any)?.tool_calls || [];

    // Emit events for each tool call
    for (const toolCall of toolCalls) {
      if (onEvent) {
        let message: string;
        const toolName = toolCall.name;
        // Use switch for different tool messages
        switch (toolName) {
          case 'get_patient_overview':
            message = 'Retrieving your info...';
            break;
          case 'get_resources_by_type':
            message = `Reading ${toolCall.args?.resourceType} records...`;
            break;
          case 'search_resources_by_keyword':
            message = 'Searching health records...';
            break;
          case 'execute_sql':
            message = 'Analyzing...';
            break;
          case 'get_fhir_resources_schema_info':
            message = 'Loading health record schema...';
            break;
          case 'finish_with_answer':
            message = 'Finalizing response...';
            break;
          default:
            message = 'Processing health record data...';
            break;
        }

        onEvent({
          type: 'status',//'tool_call',
          data: {
            toolName,
            message
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    // Execute original tool node and return its result unchanged
    const result = await new ToolNode(tools).invoke(state);

    // // Emit completion events separately (don't modify result)
    // if (onEvent && toolCalls.length > 0) {
    //   onEvent({
    //     type: 'tool_result',
    //     data: {
    //       message: 'Health data retrieval complete',
    //       toolCount: toolCalls.length
    //     },
    //     timestamp: new Date().toISOString()
    //   });
    // }

    // Return tool result unchanged - Gemini 3 expects exact format
    return result;
  };
};
// Debug function to list available models
async function listModels() {
  const client = new GoogleGenAI({
    apiKey: config.GEMINI_API_KEY,
    apiVersion: 'v1alpha', // Try v1alpha to access 3.0 models like Python
  });

  // List available models to debug
  console.log('=== DEBUGGING MODEL AVAILABILITY ===');
  try {
    // Use the correct ListModels method from the SDK
    console.log('Fetching models using ai.models.list()...');
    const modelsPager = await client.models.list();
    console.log('Models pager created successfully');

    // Iterate through the pager to get actual models
    console.log('Available models:');
    let modelCount = 0;
    for await (const model of modelsPager) {
      modelCount++;
      console.log(`${modelCount}. ${model.name} (${model.displayName || 'No display name'})   Description: ${model.description || 'No description'}`);

      // Show first few models only to avoid spam
      // if (modelCount >= 10) {
      //   console.log('... (showing first 10 models)');
      //   break;
      // }
    }

    if (modelCount === 0) {
      console.log('No models found or pager iteration failed');
    }

  } catch (error: any) {
    console.log('Error with ListModels:', error);
    console.log('Error message:', error.message);
    console.log('Error cause:', error.cause);

    // Fallback: try a direct model test
    console.log('Falling back to direct model test...');
  }
  console.log('====================================');
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

  if (!llm || !llm.bindTools) {
    throw new Error('LLM is required');
  }
  const llmWithTools = llm.bindTools(tools);

  const llmNode = async (state: GraphState) => {
    // Mirror Python: simple state access without Zod validation
    const messages = state.messages || [];
    const { onEvent } = state;

    // Emit thinking event before LLM invocation
    // if (onEvent) {
    //   onEvent({
    //     type: 'status',
    //     data: {
    //       message: 'Thinking...'
    //     },
    //     timestamp: new Date().toISOString()
    //   });
    // }

    const response = await retryLLMCall(
      async () => {
        const result = await llmWithTools.invoke(messages);
        return result;
      },
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

  // Use StateGraph with full type assertion to bypass channel type checking
  const workflow = new StateGraph({
    channels: {
      messages: {
        default: () => [],
        reducer: addMessages
      },
      patientId: { default: () => '' },
      turnCount: { default: () => 0 },
      tokensIn: { default: () => 0 },
      tokensOut: { default: () => 0 },
      onEvent: { default: () => undefined }
    }
  } as any) // ✅ Full type assertion on channels object
    .addNode("llm", llmNode)
    //.addNode("tools", new ToolNode(tools)) // Using standard ToolNode for testing
    .addNode("tools", getStreamingToolNode(tools))
    .addEdge(START, "llm")
    .addEdge("tools", "llm")
    .addConditionalEdges("llm", routeAfterLLM);

  const compiled = workflow.compile({ checkpointer });
  logger.info(`fhir_graph_compiled | tools=${tools.length}`);
  return compiled;
}
