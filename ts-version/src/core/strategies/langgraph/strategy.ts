import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph/checkpoint/memory';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { BaseStrategy, QueryContext, QueryResult } from '../../models';
import { strategyRegistry } from '../../strategy-registry';
import { ConversationState } from './state';
import { createFHIRTools } from './tools';
import { createClassifyNode } from './nodes/classify';
import { createSynthesizeNode } from './nodes/synthesize';
import { declineNode } from './nodes/decline';
import { routeAfterClassify, routeAfterLLM } from './edges';
import { SYSTEM_PROMPT } from '../utils/prompts';
import { logger } from '../../../config/logging';
import { DatabasePool } from '../../../db/session';

@strategyRegistry.register('langgraph')
export class LanggraphStrategy implements BaseStrategy {
  readonly name = 'langgraph';

  constructor(
    private dbPool: DatabasePool,
    private llm: BaseChatModel
  ) {}

  private buildGraph(context: QueryContext, resourceTypesCollector?: Set<string>): StateGraph<ConversationState> {
    const tools = createFHIRTools(this.dbPool, context.patientId, resourceTypesCollector);
    const toolNode = new ToolNode(tools);
    const llmWithTools = this.llm.bindTools(tools);

    const classifyNode = createClassifyNode(this.llm);
    const synthesizeNode = createSynthesizeNode(this.llm);

    const llmNode = async (state: ConversationState): Promise<Partial<ConversationState>> => {
      const response = await llmWithTools.invoke(state.messages || []);
      return {
        messages: [response],
        turnCount: (state.turnCount || 0) + 1,
      };
    };

    const builder = new StateGraph<ConversationState>({
      channels: {
        messages: {
          reducer: (current: any[], update: any[]) => [...current, ...update],
          default: () => [],
        },
        resourceIds: { default: () => [] },
        patientId: { default: () => '' },
        queryIntent: { default: () => '' },
        turnCount: { default: () => 0 },
        budgetExceeded: { default: () => false },
        finalAnswer: { default: () => null },
      },
    });

    builder.addNode('llm', llmNode);
    builder.addNode('tools', toolNode);
    builder.addNode('synthesize', synthesizeNode);
    builder.addNode('decline', declineNode);

    builder.addEdge('__start__', 'llm');
    builder.addConditionalEdges('llm', routeAfterLLM);
    builder.addEdge('tools', 'llm');
    builder.addEdge('synthesize', '__end__');
    builder.addEdge('decline', '__end__');

    const checkpointer = new MemorySaver();
    return builder.compile({ checkpointer });
  }

  async execute(context: QueryContext): Promise<QueryResult> {
    try {
      const startTime = Date.now();
      const graph = this.buildGraph(context);

      const initialMessages = [
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(context.queryText),
      ];

      const initialState: ConversationState = {
        messages: initialMessages,
        patientId: context.patientId,
        turnCount: 0,
        queryIntent: '',
        budgetExceeded: false,
        finalAnswer: null,
      };

      const threadId = `patient-${context.patientId}`;
      const config = { configurable: { threadId } };

      const finalState = await graph.invoke(initialState, config);

      const finalAnswer = finalState.finalAnswer || 'I could not generate an answer.';
      const resourceIds = finalState.resourceIds || [];
      const latencyMs = Date.now() - startTime;

      const modelId = (this.llm as any).model || 'unknown';

      logger.info(
        `langgraph_complete | latency_ms=${latencyMs}`,
        { latencyMs, modelId, resourceCount: resourceIds.length }
      );

      return {
        responseText: finalAnswer,
        resourceIds,
        modelUsed: modelId,
        strategyUsed: this.name,
        tokensIn: 0, // TODO: Track token usage
        tokensOut: 0,
        latencyMs,
      };

    } catch (error) {
      logger.error(
        `strategy_failed | strategy=${this.name} | patient_id=${context.patientId} | error=${error}`,
        { error, strategy: this.name, patientId: context.patientId }
      );

      return {
        responseText: '',
        resourceIds: [],
        modelUsed: (this.llm as any).model || 'unknown',
        strategyUsed: this.name,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
