import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

import { BaseStrategy, QueryContext, QueryResult } from '../../models';
import { registerStrategy } from '../../strategy-registry';
import { ConversationState } from './state';
import { buildFHIRGraph } from './graph';
import { setRunContext } from './tools';
import { SYSTEM_PROMPT } from '../utils/prompts';
import { logger } from '../../../config/logging';



export class LanggraphStrategy implements BaseStrategy {
  readonly name = 'langgraph';

  /**
   * Initialize LangGraph strategy with standard LangChain components.
   * 
   * @param dbPool - Database connection pool
   * @param llm - Standard LangChain BaseChatModel (no custom wrapper needed)
   */
  constructor(
    private dbPool: any,
    private llm: BaseChatModel
  ) {
    // Build graph using standard LangChain integration
    this._graph = buildFHIRGraph(this.dbPool, this.llm);
  }

  private _graph: any;

  async execute(context: QueryContext): Promise<QueryResult> {
    const resourceTypesCollector: Set<string> = new Set();
    setRunContext(context.patientId, resourceTypesCollector);

    try {
      const startTime = Date.now();
      
      // Format system prompt with current date
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const formattedPrompt = SYSTEM_PROMPT.replace('{current_date}', currentDate);
      
      const initialMessages = [
        new SystemMessage(formattedPrompt),
        new HumanMessage(context.queryText),
      ];

      const initialState: ConversationState = {
        messages: initialMessages,
        patientId: context.patientId,
        turnCount: 0,
        tokensIn: 0,
        tokensOut: 0,
      };

      const config = { configurable: { thread_id: `patient-${context.patientId}` } };
      const finalState = await this._graph.ainvoke(initialState, config);

      const { answer, resourceIds } = this.extractFinal(finalState.messages || []);
      const latencyMs = Date.now() - startTime;
      const modelId = (this.llm as any).model || 'unknown';

      logger.info(
        `langgraph_complete | patient=${context.patientId} | latency_ms=${latencyMs} | resource_ids=${resourceIds.length} | resource_types=${resourceTypesCollector.size}`,
        { latencyMs, patientId: context.patientId, resourceCount: resourceIds.length, resourceTypeCount: resourceTypesCollector.size }
      );

      return {
        responseText: answer,
        resourceIds,
        modelUsed: modelId,
        strategyUsed: this.name,
        tokensIn: finalState.tokensIn || 0,
        tokensOut: finalState.tokensOut || 0,
        latencyMs,
        resourceTypes: Array.from(resourceTypesCollector).sort(),
      };

    } catch (error) {
      let errorMessage = String(error);
      if (errorMessage.includes('429') || errorMessage.toUpperCase().includes('RESOURCE_EXHAUSTED')) {
        errorMessage = 'Model Rate limit exceeded. Please try again later.';
      }

      logger.error(
        `strategy_failed | strategy=${this.name} | patient_id=${context.patientId} | error=${errorMessage}`,
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
        error: errorMessage,
        resourceTypes: [],
      };
    }
  }

  private extractFinal(messages: any[]): { answer: string; resourceIds: string[] } {
    // Look for finish_with_answer ToolMessage first
    for (const msg of messages.reverse()) {
      if ((msg as any).name === 'finish_with_answer' && (msg as any).content) {
        try {
          const data = JSON.parse((msg as any).content);
          if (typeof data === 'object' && data !== null) {
            const answer = this.extractPlainText(data.answer);
            const resourceIds = Array.from(new Set(data.resource_ids || [])) as string[];
            if (answer) {
              return { answer, resourceIds };
            }
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    }

    // Fallback to last AIMessage without tool calls
    for (const msg of messages.reverse()) {
      if (msg instanceof AIMessage && !(msg.tool_calls && msg.tool_calls.length > 0)) {
        const answer = this.extractPlainText(msg.content);
        if (answer) {
          return { answer, resourceIds: [] };
        }
      }
    }

    return { answer: 'Sorry, I could not generate an answer.', resourceIds: [] };
  }

  private extractPlainText(content: any): string {
    if (content === null) return '';
    if (typeof content === 'string') {
      const trimmed = content.trim();
      if (!trimmed) return '';
      
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const parts: string[] = [];
          for (const block of parsed) {
            if (typeof block === 'object' && block !== null && 'text' in block) {
              parts.push(String(block.text));
            } else if (typeof block === 'string') {
              parts.push(block);
            }
          }
          return parts.join('\n').trim() || trimmed;
        }
      } catch {
        // Not JSON, return as-is
      }
      return trimmed;
    }
    
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const block of content) {
        if (typeof block === 'object' && block !== null && 'text' in block) {
          parts.push(String(block.text));
        } else if (typeof block === 'string') {
          parts.push(block);
        }
      }
      return parts.join('\n').trim();
    }
    
    if (typeof content === 'object' && content !== null && 'text' in content) {
      return String(content.text).trim();
    }
    
    return String(content).trim() || '';
  }
}
