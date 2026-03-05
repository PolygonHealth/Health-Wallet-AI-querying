"""Deterministic mock LLM client for tests."""

from pydantic import BaseModel

from src.llm.base_client import (
    BaseLLMClient,
    FinishReason,
    LLMResponse,
    LLMUsage,
)


class MockLLMClient(BaseLLMClient):
    """Returns configurable responses for testing."""

    def __init__(
        self,
        model_id: str = "mock",
        response_text: str = '{"answer": "Test response.", "resource_ids": []}',
        input_tokens: int = 10,
        output_tokens: int = 5,
        simulate_latency_ms: float = 0,
    ) -> None:
        super().__init__(model_id=model_id)
        self._response_text = response_text
        self._input_tokens = input_tokens
        self._output_tokens = output_tokens
        self._simulate_latency_ms = simulate_latency_ms

    async def complete(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        response_schema: type[BaseModel] | None = None,
    ) -> LLMResponse:
        if self._simulate_latency_ms > 0:
            import asyncio

            await asyncio.sleep(self._simulate_latency_ms / 1000)
        return LLMResponse(
            response=self._response_text,
            model=self.model_id,
            usage=LLMUsage(
                input_tokens=self._input_tokens,
                output_tokens=self._output_tokens,
            ),
            finish_reason=FinishReason.STOP,
        )
