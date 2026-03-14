// Constants matching Python version

export const MAX_TURNS = 10;
export const MAX_SINGLE_RESULT_CHARS = 10000;
export const MAX_TOTAL_TOOL_CHARS = 50000;
export const DEFAULT_KEYWORD_LIMIT = 10;
export const DEFAULT_RESOURCE_LIMIT = 10;
export const MAX_SQL_ROWS = 50;

// Retry constants
export const MAX_RETRIES = 2;
export const RETRY_BASE_DELAY = 30;
export const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
