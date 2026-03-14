"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryRouter = void 0;
const express_1 = require("express");
const models_1 = require("../../core/models");
const dependencies_1 = require("../dependencies");
const logging_1 = require("../../config/logging");
const router = (0, express_1.Router)();
exports.queryRouter = router;
router.post('/query', async (req, res) => {
    try {
        // Validate request
        const validatedQuery = models_1.QueryRequestSchema.parse(req.body);
        const strategyName = validatedQuery.strategy || 'langgraph';
        const modelName = validatedQuery.model || 'gemini-3.0-flash';
        logging_1.logger.info('Processing query', {
            patientId: validatedQuery.patientId,
            strategy: strategyName,
            model: modelName,
            queryLength: validatedQuery.query.length,
        });
        // Resolve strategy
        const strategy = (0, dependencies_1.resolveStrategy)(strategyName);
        // Execute query
        const context = {
            patientId: validatedQuery.patientId,
            queryText: validatedQuery.query,
            strategyName,
            modelName,
            maxTokens: 4000,
            temperature: 0.1,
        };
        const result = await strategy.execute(context);
        // Format response
        const response = models_1.QueryResponseSchema.parse({
            response: result.responseText,
            resourceIds: result.resourceIds,
            modelUsed: result.modelUsed,
            strategyUsed: result.strategyUsed,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            latencyMs: result.latencyMs,
            error: result.error,
        });
        logging_1.logger.info('Query completed', {
            patientId: validatedQuery.patientId,
            strategy: strategyName,
            latencyMs: result.latencyMs,
            resourceCount: result.resourceIds.length,
            hasError: !!result.error,
        });
        res.json(response);
    }
    catch (error) {
        logging_1.logger.error('Query failed', { error: error instanceof Error ? error.message : String(error) });
        if (error instanceof Error && error.message.includes('validation')) {
            return res.status(400).json({
                error: 'Invalid request',
                message: error.message,
            });
        }
        res.status(500).json({
            error: 'Query processing failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
//# sourceMappingURL=query.js.map