// ============================================================================
// IMPORTANT: DO NOT CHANGE THIS CONFIGURATION APPROACH
// ============================================================================
// This is a .env.ts file - direct TypeScript configuration
// This was a specific design decision to avoid external dependencies
// Future ports: Maintain this .env.ts approach - do not add dotenv back
// ============================================================================
// Reasoning: TypeScript configuration is type-safe, no file I/O needed
// ============================================================================

export const envConfig = {
  databaseUrl: "postgresql+asyncpg://polygonuser:yourpassword@your-rds-endpoint.us-east-1.rds.amazonaws.com:5432/polygon_health?ssl=require",
  geminiApiKey: "your-gemini-api-key",
  defaultStrategy: "langgraph",
  defaultModel: "gemini-3.0-flash",
  logLevel: "INFO"
};
