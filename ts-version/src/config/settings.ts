import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Zod schema for configuration validation
// Provides type safety and runtime validation
const settingsSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_HOST: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().optional(),
  DB_PORT: z.string().optional(),
  
  // AI Models
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  
  // Default Settings
  DEFAULT_STRATEGY: z.string().default('langgraph'),
  DEFAULT_MODEL: z.string().default('gemini-3-flash-preview'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  PORT: z.string().transform(Number).default('10000'),
  
  // LangGraph
  LANGGRAPH_CHECKPOINTER: z.string().default('memory'),
});

export type Settings = z.infer<typeof settingsSchema>;

// Validate and parse configuration from environment variables
// Will throw error if required fields are missing
const settings = settingsSchema.parse(process.env);

export { settings as config };
