import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseStrategy, QueryContext, QueryResult } from '../../models';
export declare class LanggraphStrategy implements BaseStrategy {
    private dbPool;
    private llm;
    readonly name = "langgraph";
    constructor(dbPool: any, llm: BaseChatModel);
    private _graph;
    execute(context: QueryContext): Promise<QueryResult>;
    private extractFinal;
    private extractPlainText;
}
//# sourceMappingURL=strategy.d.ts.map