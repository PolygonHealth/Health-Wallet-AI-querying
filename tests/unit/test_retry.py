"""Unit tests for retry logic."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from src.core.strategies.utils.retry import retry_llm_call


@pytest.mark.asyncio
async def test_returns_result_on_success():
    async def success():
        return "ok"

    result = await retry_llm_call(success, call_description="test")
    assert result == "ok"


@pytest.mark.asyncio
async def test_raises_on_non_retryable_exception():
    async def fail():
        raise ValueError("not retryable")

    with pytest.raises(ValueError, match="not retryable"):
        await retry_llm_call(fail, call_description="test")


@pytest.mark.asyncio
async def test_retries_on_429_then_succeeds():
    call_count = 0

    async def flaky():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            err = Exception("429")
            err.status_code = 429
            raise err
        return "ok"

    with patch.object(asyncio, "sleep", new_callable=AsyncMock):
        result = await retry_llm_call(flaky, call_description="test")
    assert result == "ok"
    assert call_count == 2


@pytest.mark.asyncio
async def test_raises_after_max_retries():
    call_count = 0

    async def always_fail():
        nonlocal call_count
        call_count += 1
        err = Exception("429")
        err.status_code = 429
        raise err

    with patch.object(asyncio, "sleep", new_callable=AsyncMock):
        with pytest.raises(Exception, match="429"):
            await retry_llm_call(always_fail, call_description="test")

    assert call_count == 3  # 1 initial + 2 retries
