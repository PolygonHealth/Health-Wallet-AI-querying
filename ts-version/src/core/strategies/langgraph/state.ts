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
