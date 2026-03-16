import { z } from 'zod';

// Core domain models matching Python version

export const QueryContextSchema = z.object({
  patientId: z.string().min(1),
  queryText: z.string().min(1),
  strategyName: z.string().default('langgraph'),
  modelName: z.string().default('gemini-2.5-flash'),
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
