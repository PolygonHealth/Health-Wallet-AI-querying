// LangGraph state management - TypeScript version

export const QUERY_INTENT_RELEVANT = 'relevant';
export const QUERY_INTENT_IRRELEVANT = 'irrelevant';
export const QUERY_INTENT_NEEDS_CLARIFICATION = 'needs_clarification';

export type QueryIntent = typeof QUERY_INTENT_RELEVANT | typeof QUERY_INTENT_IRRELEVANT | typeof QUERY_INTENT_NEEDS_CLARIFICATION;

export interface ConversationState {
  messages: any[]; // LangChain messages
  resourceIds?: string[];
  patientId?: string;
  queryIntent?: QueryIntent;
  turnCount?: number;
  budgetExceeded?: boolean;
  finalAnswer?: string | null;
}

// LangGraph state reducer for messages
export const addMessages = (current: any[] = [], update: any[] = []): any[] => {
  return [...current, ...update];
};
