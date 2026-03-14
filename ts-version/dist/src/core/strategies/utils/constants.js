"use strict";
// Constants matching Python version
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETRYABLE_STATUS_CODES = exports.RETRY_BASE_DELAY = exports.MAX_RETRIES = exports.MAX_SQL_ROWS = exports.DEFAULT_RESOURCE_LIMIT = exports.DEFAULT_KEYWORD_LIMIT = exports.MAX_TOTAL_TOOL_CHARS = exports.MAX_SINGLE_RESULT_CHARS = exports.MAX_TURNS = void 0;
exports.MAX_TURNS = 10;
exports.MAX_SINGLE_RESULT_CHARS = 10000;
exports.MAX_TOTAL_TOOL_CHARS = 50000;
exports.DEFAULT_KEYWORD_LIMIT = 10;
exports.DEFAULT_RESOURCE_LIMIT = 10;
exports.MAX_SQL_ROWS = 50;
// Retry constants
exports.MAX_RETRIES = 2;
exports.RETRY_BASE_DELAY = 30;
exports.RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
//# sourceMappingURL=constants.js.map