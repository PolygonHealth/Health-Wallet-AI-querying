"""Retry logic for LLM API calls (429, 500, 503, timeout)."""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import TypeVar

from src.core.strategies.utils.constants import (
    MAX_RETRIES,
    RETRY_BASE_DELAY,
    RETRYABLE_STATUS_CODES,
)

logger = logging.getLogger(__name__)

T = TypeVar("T")


async def retry_llm_call(
    call_fn: Callable[[], Awaitable[T]],
    *,
    call_description: str,
) -> T:
    """
    Wrap async LLM API call with retry on 429, 500, 503.
    Extracts retry delay from Gemini error when available; else exponential backoff.
    Raises original exception after all retries exhausted.
    """
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            return await call_fn()
        except Exception as e:
            last_exc = e
            if attempt == MAX_RETRIES:
                logger.error(
                    "retry_exhausted | call=%s | attempts=%d | error=%s",
                    call_description,
                    MAX_RETRIES + 1,
                    str(e),
                )
                raise

            status = _extract_status_code(e)
            if status not in RETRYABLE_STATUS_CODES:
                raise

            delay = _extract_retry_delay(e) or (RETRY_BASE_DELAY * (2**attempt))
            logger.warning(
                "retry_scheduled | call=%s | attempt=%d | status=%s | delay_s=%.0f",
                call_description,
                attempt + 1,
                status,
                delay,
            )
            await asyncio.sleep(delay)

    assert last_exc is not None
    raise last_exc


def _extract_status_code(exc: Exception) -> int | None:
    """Extract HTTP status code from exception if present."""
    if hasattr(exc, "status_code"):
        return getattr(exc, "status_code")
    if hasattr(exc, "response") and exc.response is not None:
        return getattr(exc.response, "status_code", None)
    if hasattr(exc, "status"):
        return getattr(exc, "status")
    # Try parsing from message (e.g. "429 Resource Exhausted")
    msg = str(exc).lower()
    for code in RETRYABLE_STATUS_CODES:
        if str(code) in msg:
            return code
    return None


def _extract_retry_delay(exc: Exception) -> float | None:
    """Parse retryDelay from Gemini error JSON when available."""
    if hasattr(exc, "message") and exc.message:
        try:
            # Gemini may return JSON with retryDelay in seconds
            data = json.loads(exc.message)
            if isinstance(data, dict) and "retryDelay" in data:
                return float(data["retryDelay"])
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    if hasattr(exc, "details") and exc.details:
        try:
            data = json.loads(str(exc.details))
            if isinstance(data, dict) and "retryDelay" in data:
                return float(data["retryDelay"])
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    return None
