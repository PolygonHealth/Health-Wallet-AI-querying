import { z } from 'zod';
export declare const QueryContextSchema: z.ZodObject<{
    patientId: z.ZodString;
    queryText: z.ZodString;
    strategyName: z.ZodDefault<z.ZodString>;
    modelName: z.ZodDefault<z.ZodString>;
    maxTokens: z.ZodDefault<z.ZodNumber>;
    temperature: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    patientId: string;
    queryText: string;
    strategyName: string;
    modelName: string;
    maxTokens: number;
    temperature: number;
}, {
    patientId: string;
    queryText: string;
    strategyName?: string | undefined;
    modelName?: string | undefined;
    maxTokens?: number | undefined;
    temperature?: number | undefined;
}>;
export type QueryContext = z.infer<typeof QueryContextSchema>;
export declare const QueryResultSchema: z.ZodObject<{
    responseText: z.ZodString;
    resourceIds: z.ZodArray<z.ZodString, "many">;
    modelUsed: z.ZodString;
    strategyUsed: z.ZodString;
    tokensIn: z.ZodDefault<z.ZodNumber>;
    tokensOut: z.ZodDefault<z.ZodNumber>;
    latencyMs: z.ZodNumber;
    error: z.ZodOptional<z.ZodString>;
    resourceTypes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    responseText: string;
    resourceIds: string[];
    modelUsed: string;
    strategyUsed: string;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    error?: string | undefined;
    resourceTypes?: string[] | undefined;
}, {
    responseText: string;
    resourceIds: string[];
    modelUsed: string;
    strategyUsed: string;
    latencyMs: number;
    error?: string | undefined;
    tokensIn?: number | undefined;
    tokensOut?: number | undefined;
    resourceTypes?: string[] | undefined;
}>;
export type QueryResult = z.infer<typeof QueryResultSchema>;
export declare const QueryRequestSchema: z.ZodObject<{
    patientId: z.ZodString;
    query: z.ZodString;
    strategy: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    patientId: string;
    query: string;
    strategy?: string | undefined;
    model?: string | undefined;
}, {
    patientId: string;
    query: string;
    strategy?: string | undefined;
    model?: string | undefined;
}>;
export type QueryRequest = z.infer<typeof QueryRequestSchema>;
export declare const QueryResponseSchema: z.ZodObject<{
    response: z.ZodString;
    resourceIds: z.ZodArray<z.ZodString, "many">;
    modelUsed: z.ZodString;
    strategyUsed: z.ZodString;
    tokensIn: z.ZodNumber;
    tokensOut: z.ZodNumber;
    latencyMs: z.ZodNumber;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    resourceIds: string[];
    modelUsed: string;
    strategyUsed: string;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    response: string;
    error?: string | undefined;
}, {
    resourceIds: string[];
    modelUsed: string;
    strategyUsed: string;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    response: string;
    error?: string | undefined;
}>;
export type QueryResponse = z.infer<typeof QueryResponseSchema>;
export interface BaseStrategy {
    readonly name: string;
    execute(context: QueryContext): Promise<QueryResult>;
}
export interface BaseLLMClient {
    readonly modelId: string;
    generateWithTools(params: {
        contents: any[];
        tools: any[];
        maxTokens: number;
        temperature: number;
        useTools: boolean;
    }): Promise<LLMResponse>;
}
export interface LLMResponse {
    text: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
    functionCalls?: any[];
    rawModelContent?: any;
}
export interface FHIRResource {
    id: string;
    patientId: string;
    resourceType: string;
    fhirId: string;
    fhirVersion: string;
    resource: any;
    receivedAt: Date;
    kno2RequestRef: boolean;
    hasDocumentText: boolean;
}
export interface PatientOverview {
    resourceCounts: Record<string, number>;
    dateRanges: Record<string, {
        earliest: string;
        latest: string;
    }>;
}
//# sourceMappingURL=models.d.ts.map