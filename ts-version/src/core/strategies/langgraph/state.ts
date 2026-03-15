import { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';

// Zod schema for LangGraph state
export const StateSchema = z.object({
  messages: z.array(z.custom<BaseMessage>()),
  patientId: z.string().default(''),
  turnCount: z.number().default(0),
  tokensIn: z.number().default(0),
  tokensOut: z.number().default(0),
});

// TypeScript type inferred from Zod schema
export type GraphState = z.infer<typeof StateSchema>;

// Legacy interface for compatibility
export interface ConversationState {
  messages: any[]; // LangChain messages
  patientId?: string;
  turnCount?: number;
  tokensIn?: number;
  tokensOut?: number;
}

// LangGraph state reducer for messages
export const addMessages = (current: any[] = [], update: any[] = []): any[] => {
  return [...current, ...update];
};
