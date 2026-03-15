import { z } from 'zod';

// Core domain models matching Python version

export const QueryContextSchema = z.object({
  patientId: z.string().min(1),
  queryText: z.string().min(1),
  strategyName: z.string().default('langgraph'),
  modelName: z.string().default('gemini-3.0-flash'),
  maxTokens: z.number().default(4096),
  temperature: z.number().default(0.1),
});

export type QueryContext = z.infer<typeof QueryContextSchema>;

export const QueryResultSchema = z.object({
  responseText: z.string(),
  resourceIds: z.array(z.string()),
  modelUsed: z.string(),
  strategyUsed: z.string(),
  tokensIn: z.number().default(0),
  tokensOut: z.number().default(0),
  latencyMs: z.number(),
  error: z.string().optional(),
  resourceTypes: z.array(z.string()).optional(),
});

export type QueryResult = z.infer<typeof QueryResultSchema>;

export const QueryRequestSchema = z.object({
  patientId: z.string().min(1),
  query: z.string().min(1),
  strategy: z.string().optional(),
  model: z.string().optional(),
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export const QueryResponseSchema = z.object({
  response: z.string(),
  resourceIds: z.array(z.string()),
  modelUsed: z.string(),
  strategyUsed: z.string(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  latencyMs: z.number(),
  error: z.string().optional(),
});

export type QueryResponse = z.infer<typeof QueryResponseSchema>;

// Strategy interface
export interface BaseStrategy {
  readonly name: string;
  execute(context: QueryContext): Promise<QueryResult>;
}

/**
 * TypeScript vs Python LLM Interface Design:
 * 
 * TYPESCRIPT APPROACH:
 * - Uses standard LangChain BaseChatModel interface directly
 * - No custom LLM client wrapper needed - LangChain handles everything
 * - Type safety via LangChain's well-defined interfaces
 * - Built-in support for tools, streaming, callbacks, token counting
 * - Matches admin project pattern for consistency
 * 
 * PYTHON APPROACH:
 * - Uses custom BaseLLMClient interface for fine-grained control
 * - Direct Google AI API integration for optimal performance
 * - Custom wrapper allows specialized token counting and response handling
 * - Manual tool binding and streaming implementation
 * - Different architectural philosophy prioritizing explicit control
 * 
 * WHY NO CUSTOM LLM INTERFACE IN TYPESCRIPT:
 * - LangChain provides standardized, well-tested interfaces
 * - Custom wrappers add complexity without providing benefits
 * - Type compatibility issues between custom interfaces and LangChain
 * - Admin project and community best practices use direct LangChain
 * - Better maintainability and ecosystem integration
 */

// Database types
export interface FHIRResource {
  id: string;
  patientId: string;
  resourceType: string;
  fhirId: string;
  fhirVersion: string;
  resource: any; // JSON object
  receivedAt: Date;
  kno2RequestRef: boolean;
  hasDocumentText: boolean;
}

export interface PatientOverview {
  resourceCounts: Record<string, number>;
  dateRanges: Record<string, { earliest: string; latest: string }>;
}
