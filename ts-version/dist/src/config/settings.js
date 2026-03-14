"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
// ============================================================================
// IMPORTANT: DO NOT CHANGE THIS CONFIGURATION APPROACH
// ============================================================================
// This file contains configuration directly (no external files)
// This was a specific design decision to avoid external dependencies
// Future ports: Maintain this direct configuration approach
// ============================================================================
// Reasoning: Simplest, most direct, no file I/O or imports needed
// ============================================================================
// Direct configuration object
const envConfig = {
    databaseUrl: "postgresql+asyncpg://polygonuser:yourpassword@your-rds-endpoint.us-east-1.rds.amazonaws.com:5432/polygon_health?ssl=require",
    geminiApiKey: "your-gemini-api-key",
    defaultStrategy: "langgraph",
    defaultModel: "gemini-3.0-flash",
    logLevel: "info",
    port: "10000"
};
// Zod schema for configuration validation
// Provides type safety and runtime validation
const settingsSchema = zod_1.z.object({
    // Database
    databaseUrl: zod_1.z.string().min(1, 'databaseUrl is required'),
    // AI Models
    geminiApiKey: zod_1.z.string().min(1, 'geminiApiKey is required'),
    openaiApiKey: zod_1.z.string().optional(),
    anthropicApiKey: zod_1.z.string().optional(),
    // Default Settings
    defaultStrategy: zod_1.z.string().default('langgraph'),
    defaultModel: zod_1.z.string().default('gemini-3.0-flash'),
    logLevel: zod_1.z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    port: zod_1.z.string().transform(Number).default('10000'),
    // LangGraph
    langgraphCheckpointer: zod_1.z.string().default('memory'),
});
// Validate and parse configuration
// Will throw error if required fields are missing
const settings = settingsSchema.parse(envConfig);
exports.config = settings;
//# sourceMappingURL=settings.js.map