"""Mock GeminiClient for agentic strategy tests. Supports generate_with_tools."""

from src.llm.base_client import FinishReason, LLMUsage
from src.llm.providers.gemini import GeminiClient, ToolCallResponse


class MockGeminiForAgentic(GeminiClient):
    """GeminiClient that returns scripted ToolCallResponse for testing agentic strategy."""

    def __init__(self, *, responses: list[ToolCallResponse], model_id: str = "gemini-mock") -> None:
        super().__init__(model_id=model_id)
        self._responses = list(responses)

    async def generate_with_tools(
        self,
        contents,
        tools,
        max_tokens: int,
        temperature: float,
        *,
        use_tools: bool = True,
    ) -> ToolCallResponse:
        if not self._responses:
            return ToolCallResponse(
                text="No more responses",
                function_calls=[],
                usage=LLMUsage(input_tokens=0, output_tokens=0),
                finish_reason=FinishReason.STOP,
            )
        return self._responses.pop(0)
