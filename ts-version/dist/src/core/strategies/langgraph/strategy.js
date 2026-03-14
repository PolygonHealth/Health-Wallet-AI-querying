"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanggraphStrategy = void 0;
const chat_models_1 = require("@langchain/core/language_models/chat_models");
const messages_1 = require("@langchain/core/messages");
const strategy_registry_1 = require("../../strategy-registry");
const graph_1 = require("./graph");
const tools_1 = require("./tools");
const prompts_1 = require("../utils/prompts");
const logging_1 = require("../../../config/logging");
let LanggraphStrategy = class LanggraphStrategy {
    constructor(dbPool, llm) {
        this.dbPool = dbPool;
        this.llm = llm;
        this.name = 'langgraph';
        this._graph = (0, graph_1.buildFHIRGraph)(this.dbPool, this.llm);
    }
    async execute(context) {
        const resourceTypesCollector = new Set();
        (0, tools_1.setRunContext)(context.patientId, resourceTypesCollector);
        try {
            const startTime = Date.now();
            const initialMessages = [
                new messages_1.SystemMessage(prompts_1.SYSTEM_PROMPT),
                new messages_1.HumanMessage(context.queryText),
            ];
            const initialState = {
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
            const modelId = this.llm.model || 'unknown';
            logging_1.logger.info(`langgraph_complete | patient=${context.patientId} | latency_ms=${latencyMs} | resource_ids=${resourceIds.length} | resource_types=${resourceTypesCollector.size}`, { latencyMs, patientId: context.patientId, resourceCount: resourceIds.length, resourceTypeCount: resourceTypesCollector.size });
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
        }
        catch (error) {
            let errorMessage = String(error);
            if (errorMessage.includes('429') || errorMessage.toUpperCase().includes('RESOURCE_EXHAUSTED')) {
                errorMessage = 'Model Rate limit exceeded. Please try again later.';
            }
            logging_1.logger.error(`strategy_failed | strategy=${this.name} | patient_id=${context.patientId} | error=${errorMessage}`, { error, strategy: this.name, patientId: context.patientId });
            return {
                responseText: '',
                resourceIds: [],
                modelUsed: this.llm.model || 'unknown',
                strategyUsed: this.name,
                tokensIn: 0,
                tokensOut: 0,
                latencyMs: 0,
                error: errorMessage,
                resourceTypes: [],
            };
        }
    }
    extractFinal(messages) {
        // Look for finish_with_answer ToolMessage first
        for (const msg of messages.reverse()) {
            if (msg.name === 'finish_with_answer' && msg.content) {
                try {
                    const data = JSON.parse(msg.content);
                    if (typeof data === 'object' && data !== null) {
                        const answer = this.extractPlainText(data.answer);
                        const resourceIds = Array.from(new Set(data.resource_ids || []));
                        if (answer) {
                            return { answer, resourceIds };
                        }
                    }
                }
                catch {
                    // Ignore JSON parse errors
                }
            }
        }
        // Fallback to last AIMessage without tool calls
        for (const msg of messages.reverse()) {
            if (msg instanceof messages_1.AIMessage && !(msg.tool_calls && msg.tool_calls.length > 0)) {
                const answer = this.extractPlainText(msg.content);
                if (answer) {
                    return { answer, resourceIds: [] };
                }
            }
        }
        return { answer: 'Sorry, I could not generate an answer.', resourceIds: [] };
    }
    extractPlainText(content) {
        if (content === null)
            return '';
        if (typeof content === 'string') {
            const trimmed = content.trim();
            if (!trimmed)
                return '';
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    const parts = [];
                    for (const block of parsed) {
                        if (typeof block === 'object' && block !== null && 'text' in block) {
                            parts.push(String(block.text));
                        }
                        else if (typeof block === 'string') {
                            parts.push(block);
                        }
                    }
                    return parts.join('\n').trim() || trimmed;
                }
            }
            catch {
                // Not JSON, return as-is
            }
            return trimmed;
        }
        if (Array.isArray(content)) {
            const parts = [];
            for (const block of content) {
                if (typeof block === 'object' && block !== null && 'text' in block) {
                    parts.push(String(block.text));
                }
                else if (typeof block === 'string') {
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
};
exports.LanggraphStrategy = LanggraphStrategy;
exports.LanggraphStrategy = LanggraphStrategy = __decorate([
    (0, strategy_registry_1.registerStrategy)('langgraph'),
    __metadata("design:paramtypes", [Object, chat_models_1.BaseChatModel])
], LanggraphStrategy);
//# sourceMappingURL=strategy.js.map