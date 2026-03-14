"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFHIRGraph = buildFHIRGraph;
const messages_1 = require("@langchain/core/messages");
const langgraph_1 = require("@langchain/langgraph");
const langgraph_2 = require("@langchain/langgraph");
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const zod_1 = require("zod");
const zod_2 = require("@langchain/langgraph/zod");
const langgraph_3 = require("@langchain/langgraph");
const tools_1 = require("./tools");
const retry_1 = require("../utils/retry");
const constants_1 = require("../utils/constants");
const logging_1 = require("../../../config/logging");
// Zod schema using exact admin project pattern
const StateSchema = zod_1.z.object({
    messages: zod_1.z.array(zod_1.z.custom())
        .register(zod_2.registry, {
        reducer: {
            fn: langgraph_3.addMessages,
        },
        default: () => [],
    }),
    patientId: zod_1.z.string()
        .register(zod_2.registry, {
        reducer: {
            fn: (left, right) => right,
        },
        default: () => '',
    }),
    turnCount: zod_1.z.number()
        .register(zod_2.registry, {
        reducer: {
            fn: (left, right) => right,
        },
        default: () => 0,
    }),
    tokensIn: zod_1.z.number()
        .register(zod_2.registry, {
        reducer: {
            fn: (left, right) => right,
        },
        default: () => 0,
    }),
    tokensOut: zod_1.z.number()
        .register(zod_2.registry, {
        reducer: {
            fn: (left, right) => right,
        },
        default: () => 0,
    }),
});
function extractUsage(usage, response, llm, messages, tools) {
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
            if (llm.get_num_tokens_from_messages) {
                deltaIn = llm.get_num_tokens_from_messages(messages, { tools });
            }
            const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content || '');
            deltaOut = llm.get_num_tokens ? llm.get_num_tokens(content) : 0;
        }
        catch (error) {
            logging_1.logger.warning('failed_to_extract_token_usage', { error: String(error) });
        }
    }
    return [deltaIn, deltaOut];
}
function routeAfterLLM(state) {
    // Validate state with Zod
    const validatedState = StateSchema.parse(state);
    if (validatedState.turnCount >= constants_1.MAX_TURNS) {
        return langgraph_1.END;
    }
    const messages = validatedState.messages || [];
    if (!messages.length) {
        return langgraph_1.END;
    }
    const last = messages[messages.length - 1];
    if (last instanceof messages_1.AIMessage && last.tool_calls && last.tool_calls.length > 0) {
        return 'tools';
    }
    return langgraph_1.END;
}
function buildFHIRGraph(dbPool, llm, checkpointer) {
    if (!checkpointer) {
        checkpointer = new langgraph_2.MemorySaver();
    }
    const tools = (0, tools_1.createFHIRTools)(dbPool);
    // Check if bindTools is available before using it
    const llmWithTools = llm.bindTools ? llm.bindTools(tools) : llm;
    const llmNode = async (state) => {
        // Validate state with Zod
        const validatedState = StateSchema.parse(state);
        const messages = validatedState.messages || [];
        const response = await (0, retry_1.retryLLMCall)(async () => llmWithTools.invoke(messages), 'llm_node');
        const usage = response.usage_metadata;
        const [deltaIn, deltaOut] = extractUsage(usage, response, llm, messages, tools);
        return {
            messages: [...validatedState.messages, response],
            turnCount: validatedState.turnCount + 1,
            tokensIn: validatedState.tokensIn + deltaIn,
            tokensOut: validatedState.tokensOut + deltaOut,
        };
    };
    // Use built-in ToolNode like admin project
    const toolNode = new prebuilt_1.ToolNode(tools);
    // Build StateGraph using Zod schema directly (exact admin project pattern)
    const workflow = new langgraph_1.StateGraph(StateSchema)
        .addNode('llm', llmNode)
        .addNode('tools', toolNode)
        .addEdge(langgraph_1.START, 'llm')
        .addEdge('tools', 'llm')
        .addConditionalEdges('llm', routeAfterLLM);
    const compiled = workflow.compile({ checkpointer });
    logging_1.logger.info(`fhir_graph_compiled | tools=${tools.length} | zod_validation=enabled | exact_admin_pattern=true | zod_state_management=true`);
    return compiled;
}
//# sourceMappingURL=graph.js.map