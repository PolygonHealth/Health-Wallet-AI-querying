"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryLLMCall = retryLLMCall;
const logging_1 = require("../../../config/logging");
const constants_1 = require("./constants");
async function retryLLMCall(callFn, callDescription) {
    let lastExc = null;
    for (let attempt = 0; attempt <= constants_1.MAX_RETRIES; attempt++) {
        try {
            return await callFn();
        }
        catch (e) {
            lastExc = e instanceof Error ? e : new Error(String(e));
            if (attempt === constants_1.MAX_RETRIES) {
                logging_1.logger.error(`retry_exhausted | call=${callDescription} | attempts=${constants_1.MAX_RETRIES + 1} | error=${String(e)}`);
                throw lastExc;
            }
            const status = extractStatusCode(e);
            if (status === null || !constants_1.RETRYABLE_STATUS_CODES.has(status)) {
                throw e;
            }
            const delay = extractRetryDelay(e) || (constants_1.RETRY_BASE_DELAY * Math.pow(2, attempt));
            logging_1.logger.warning(`retry_scheduled | call=${callDescription} | attempt=${attempt + 1} | status=${status} | delay_s=${Math.round(delay)}`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
    }
    throw lastExc;
}
function extractStatusCode(exc) {
    if (exc && typeof exc === 'object') {
        if ('status_code' in exc)
            return exc.status_code;
        if ('response' in exc && exc.response && 'status_code' in exc.response) {
            return exc.response.status_code;
        }
        if ('status' in exc)
            return exc.status;
    }
    // Try parsing from message (e.g. "429 Resource Exhausted")
    const msg = String(exc).toLowerCase();
    for (const code of constants_1.RETRYABLE_STATUS_CODES) {
        if (msg.includes(code.toString())) {
            return code;
        }
    }
    return null;
}
function extractRetryDelay(exc) {
    if (exc && typeof exc === 'object') {
        // Check for message property with JSON
        if ('message' in exc && typeof exc.message === 'string') {
            try {
                const data = JSON.parse(exc.message);
                if (typeof data === 'object' && data !== null && 'retryDelay' in data) {
                    return Number(data.retryDelay);
                }
            }
            catch {
                // Ignore JSON parse errors
            }
        }
        // Check for details property with JSON
        if ('details' in exc && typeof exc.details === 'string') {
            try {
                const data = JSON.parse(exc.details);
                if (typeof data === 'object' && data !== null && 'retryDelay' in data) {
                    return Number(data.retryDelay);
                }
            }
            catch {
                // Ignore JSON parse errors
            }
        }
    }
    return null;
}
//# sourceMappingURL=retry.js.map