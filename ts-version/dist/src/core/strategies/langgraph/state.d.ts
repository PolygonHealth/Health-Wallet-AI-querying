export interface ConversationState {
    messages: any[];
    patientId?: string;
    turnCount?: number;
    tokensIn?: number;
    tokensOut?: number;
}
export declare const addMessages: (current?: any[], update?: any[]) => any[];
//# sourceMappingURL=state.d.ts.map