import { z } from 'zod';

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
const settingsSchema = z.object({
  // Database
  databaseUrl: z.string().min(1, 'databaseUrl is required'),
  
  // AI Models
  geminiApiKey: z.string().min(1, 'geminiApiKey is required'),
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  
  // Default Settings
  defaultStrategy: z.string().default('langgraph'),
  defaultModel: z.string().default('gemini-3.0-flash'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  port: z.string().transform(Number).default('10000'),
  
  // LangGraph
  langgraphCheckpointer: z.string().default('memory'),
});

export type Settings = z.infer<typeof settingsSchema>;

// Validate and parse configuration
// Will throw error if required fields are missing
const settings = settingsSchema.parse(envConfig);

export { settings as config };
