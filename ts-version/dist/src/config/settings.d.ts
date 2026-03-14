import { z } from 'zod';
declare const settingsSchema: z.ZodObject<{
    databaseUrl: z.ZodString;
    geminiApiKey: z.ZodString;
    openaiApiKey: z.ZodOptional<z.ZodString>;
    anthropicApiKey: z.ZodOptional<z.ZodString>;
    defaultStrategy: z.ZodDefault<z.ZodString>;
    defaultModel: z.ZodDefault<z.ZodString>;
    logLevel: z.ZodDefault<z.ZodEnum<["error", "warn", "info", "debug"]>>;
    port: z.ZodDefault<z.ZodEffects<z.ZodString, number, string>>;
    langgraphCheckpointer: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    databaseUrl: string;
    geminiApiKey: string;
    defaultStrategy: string;
    defaultModel: string;
    logLevel: "error" | "warn" | "info" | "debug";
    port: number;
    langgraphCheckpointer: string;
    openaiApiKey?: string | undefined;
    anthropicApiKey?: string | undefined;
}, {
    databaseUrl: string;
    geminiApiKey: string;
    openaiApiKey?: string | undefined;
    anthropicApiKey?: string | undefined;
    defaultStrategy?: string | undefined;
    defaultModel?: string | undefined;
    logLevel?: "error" | "warn" | "info" | "debug" | undefined;
    port?: string | undefined;
    langgraphCheckpointer?: string | undefined;
}>;
export type Settings = z.infer<typeof settingsSchema>;
declare const settings: {
    databaseUrl: string;
    geminiApiKey: string;
    defaultStrategy: string;
    defaultModel: string;
    logLevel: "error" | "warn" | "info" | "debug";
    port: number;
    langgraphCheckpointer: string;
    openaiApiKey?: string | undefined;
    anthropicApiKey?: string | undefined;
};
export { settings as config };
//# sourceMappingURL=settings.d.ts.map