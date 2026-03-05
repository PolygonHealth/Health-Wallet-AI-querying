import pytest

from tests.mocks.mock_llm_client import MockLLMClient


@pytest.mark.asyncio
async def test_returns_configured_response_text():
    client = MockLLMClient(
        model_id="mock",
        response_text='{"answer": "Hello world.", "resource_ids": ["r1"]}',
    )
    resp = await client.complete(prompt="test", max_tokens=100, temperature=0.1)
    assert resp.response == '{"answer": "Hello world.", "resource_ids": ["r1"]}'


@pytest.mark.asyncio
async def test_returns_correct_token_counts():
    client = MockLLMClient(
        model_id="mock",
        input_tokens=42,
        output_tokens=17,
    )
    resp = await client.complete(prompt="test", max_tokens=100, temperature=0.1)
    assert resp.usage.input_tokens == 42
    assert resp.usage.output_tokens == 17


@pytest.mark.asyncio
async def test_simulates_latency_when_configured():
    client = MockLLMClient(
        model_id="mock",
        simulate_latency_ms=50,
    )
    import time

    t0 = time.perf_counter()
    await client.complete(prompt="test", max_tokens=100, temperature=0.1)
    elapsed = (time.perf_counter() - t0) * 1000
    assert elapsed >= 45  # allow some tolerance
