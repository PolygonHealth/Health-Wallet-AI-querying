"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryResponseSchema = exports.QueryRequestSchema = exports.QueryResultSchema = exports.QueryContextSchema = void 0;
const zod_1 = require("zod");
// Core domain models matching Python version
exports.QueryContextSchema = zod_1.z.object({
    patientId: zod_1.z.string().min(1),
    queryText: zod_1.z.string().min(1),
    strategyName: zod_1.z.string().default('langgraph'),
    modelName: zod_1.z.string().default('gemini-3.0-flash'),
    maxTokens: zod_1.z.number().default(4000),
    temperature: zod_1.z.number().default(0.1),
});
exports.QueryResultSchema = zod_1.z.object({
    responseText: zod_1.z.string(),
    resourceIds: zod_1.z.array(zod_1.z.string()),
    modelUsed: zod_1.z.string(),
    strategyUsed: zod_1.z.string(),
    tokensIn: zod_1.z.number().default(0),
    tokensOut: zod_1.z.number().default(0),
    latencyMs: zod_1.z.number(),
    error: zod_1.z.string().optional(),
    resourceTypes: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.QueryRequestSchema = zod_1.z.object({
    patientId: zod_1.z.string().min(1),
    query: zod_1.z.string().min(1),
    strategy: zod_1.z.string().optional(),
    model: zod_1.z.string().optional(),
});
exports.QueryResponseSchema = zod_1.z.object({
    response: zod_1.z.string(),
    resourceIds: zod_1.z.array(zod_1.z.string()),
    modelUsed: zod_1.z.string(),
    strategyUsed: zod_1.z.string(),
    tokensIn: zod_1.z.number(),
    tokensOut: zod_1.z.number(),
    latencyMs: zod_1.z.number(),
    error: zod_1.z.string().optional(),
});
//# sourceMappingURL=models.js.map