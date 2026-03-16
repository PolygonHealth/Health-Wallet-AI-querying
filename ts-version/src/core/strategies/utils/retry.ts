import { logger } from '../../../config/logging';
import { MAX_RETRIES, RETRY_BASE_DELAY, RETRYABLE_STATUS_CODES } from './constants';

export async function retryLLMCall<T>(
  callFn: () => Promise<T>,
  callDescription: string
): Promise<T> {
  let lastExc: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callFn();
    } catch (e) {
      lastExc = e instanceof Error ? e : new Error(String(e));
      
      if (attempt === MAX_RETRIES) {
        logger.error(
          `retry_exhausted | call=${callDescription} | attempts=${MAX_RETRIES + 1} | error=${String(e)}`
        );
        throw lastExc;
      }

      const status = extractStatusCode(e);
      if (status === null || !RETRYABLE_STATUS_CODES.has(status)) {
        throw e;
      }

      const delay = extractRetryDelay(e) || (RETRY_BASE_DELAY * Math.pow(2, attempt));
      logger.warning(
        `retry_scheduled | call=${callDescription} | attempt=${attempt + 1} | status=${status} | delay_s=${Math.round(delay)}`
      );
      
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }
  }

  throw lastExc;
}

function extractStatusCode(exc: any): number | null {
  if (exc && typeof exc === 'object') {
    if ('status_code' in exc) return exc.status_code as number;
    if ('response' in exc && exc.response && 'status_code' in exc.response) {
      return exc.response.status_code as number;
    }
    if ('status' in exc) return exc.status as number;
  }

  // Try parsing from message (e.g. "429 Resource Exhausted")
  const msg = String(exc).toLowerCase();
  for (const code of RETRYABLE_STATUS_CODES) {
    if (msg.includes(code.toString())) {
      return code;
    }
  }
  
  return null;
}

function extractRetryDelay(exc: any): number | null {
  if (exc && typeof exc === 'object') {
    // Check for message property with JSON
    if ('message' in exc && typeof exc.message === 'string') {
      try {
        const data = JSON.parse(exc.message);
        if (typeof data === 'object' && data !== null && 'retryDelay' in data) {
          return Number(data.retryDelay);
        }
      } catch {
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
      } catch {
        // Ignore JSON parse errors
      }
    }
  }

  return null;
}
