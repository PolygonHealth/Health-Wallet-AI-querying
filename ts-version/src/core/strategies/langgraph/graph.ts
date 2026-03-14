import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';

import { createFHIRTools } from './tools';
import { retryLLMCall } from '../utils/retry';
import { MAX_TURNS } from '../utils/constants';
import { logger } from '../../../config/logging';

// Zod schema using admin project mixed pattern - plain Zod for simple fields
const StateSchema = z.object({
  // Main messages field - NO register (let LangGraph handle default merging)
  messages: z.array(z.custom<BaseMessage>()),
  
  // Simple primitive fields - NO register (let LangGraph handle default behavior)
  patientId: z.string().default(''),
  turnCount: z.number().default(0),
  tokensIn: z.number().default(0),
  tokensOut: z.number().default(0),
});

// Infer the TypeScript type from the Zod schema
type GraphState = z.infer<typeof StateSchema>;

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
      // Fallback to tokenizer if available
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
  // Validate state with Zod
  const validatedState = StateSchema.parse(state);
  
  if (validatedState.turnCount >= MAX_TURNS) {
    return END;
  }

  const messages = validatedState.messages || [];
  if (!messages.length) {
    return END;
  }

  const last = messages[messages.length - 1];
  if (last instanceof AIMessage && last.tool_calls && last.tool_calls.length > 0) {
    return 'tools';
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
  
  // Check if bindTools is available before using it
  const llmWithTools = (llm as any).bindTools ? (llm as any).bindTools(tools) : llm;

  const llmNode = async (state: GraphState) => {
    // Validate state with Zod
    const validatedState = StateSchema.parse(state);
    const messages = validatedState.messages || [];
    
    const response = await retryLLMCall(
      async () => llmWithTools.invoke(messages),
      'llm_node'
    );
    
    const usage = (response as any).usage_metadata;
    const [deltaIn, deltaOut] = extractUsage(usage, response as AIMessage, llm, messages, tools);

    return {
      messages: [...validatedState.messages, response],
      turnCount: validatedState.turnCount + 1,
      tokensIn: validatedState.tokensIn + deltaIn,
      tokensOut: validatedState.tokensOut + deltaOut,
    };
  };

  // Use built-in ToolNode like admin project
  const toolNode = new ToolNode(tools);

  // Build StateGraph using Zod schema directly (exact admin project pattern)
  const workflow = new StateGraph(StateSchema)
    .addNode('llm', llmNode)
    .addNode('tools', toolNode)
    .addEdge(START, 'llm')
    .addEdge('tools', 'llm')
    .addConditionalEdges('llm', routeAfterLLM);

  const compiled = workflow.compile({ checkpointer });
  logger.info(`fhir_graph_compiled | tools=${tools.length} | zod_validation=enabled | exact_admin_pattern=true | zod_state_management=true`);
  return compiled;
}
