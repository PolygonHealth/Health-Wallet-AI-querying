// Constants matching Python version

export const MAX_TURNS = 10;
export const MAX_SINGLE_TOOL_CHARS = 50000; // Updated from Python: 50_000
export const MAX_TOTAL_TOOL_CHARS = 200000; // Updated from Python: 200_000
export const DEFAULT_KEYWORD_LIMIT = 10;
export const DEFAULT_RESOURCE_LIMIT = 20; // Updated from Python: 20
export const DEFAULT_NOTE_LIMIT = 5; // Added from Python
export const SQL_MAX_ROWS = 50; // Renamed from MAX_SQL_ROWS for consistency

// SQL Guard constants
export const ALLOWED_TABLES = new Set(['fhir_resources']);

// Retry constants
export const MAX_RETRIES = 2;
export const RETRY_BASE_DELAY = 30;
export const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
