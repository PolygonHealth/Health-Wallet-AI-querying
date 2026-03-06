"""Unit tests for AgenticStrategy with mocked Gemini and DB."""

from unittest.mock import AsyncMock, patch

import pytest

from src.core.models import QueryContext, QueryResult
from src.core.strategies.agentic.strategy import AgenticStrategy
from src.llm.base_client import FinishReason, LLMUsage
from src.llm.providers.gemini import ToolCallResponse
from tests.mocks.mock_gemini_for_agentic import MockGeminiForAgentic


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def llm_no_tool_calls():
    """LLM returns text immediately, no function calls."""
    return MockGeminiForAgentic(
        responses=[
            ToolCallResponse(
                text="Based on the overview, the patient has 2 conditions.",
                function_calls=[],
                usage=LLMUsage(input_tokens=100, output_tokens=20),
                finish_reason=FinishReason.STOP,
            ),
        ],
    )


@pytest.fixture
def strategy(mock_db, llm_no_tool_calls):
    return AgenticStrategy(db=mock_db, llm_client=llm_no_tool_calls)


@pytest.mark.asyncio
async def test_returns_final_text_when_no_tool_calls(strategy):
    ctx = QueryContext(
        patient_id="p1",
        query_text="What conditions do I have?",
        strategy_name="agentic",
        model_name="gemini",
    )
    result = await strategy.execute(ctx)

    assert "conditions" in result.response_text.lower()
    assert isinstance(result, QueryResult)
    assert result.strategy_used == "agentic"


@pytest.mark.asyncio
async def test_returns_error_when_not_gemini_client(mock_db):
    from tests.mocks.mock_llm_client import MockLLMClient

    mock_llm = MockLLMClient(model_id="mock")
    strategy = AgenticStrategy(db=mock_db, llm_client=mock_llm)
    ctx = QueryContext(
        patient_id="p1",
        query_text="q",
        strategy_name="agentic",
        model_name="mock",
    )
    result = await strategy.execute(ctx)
    assert result.error is not None
    assert "Gemini" in result.error


@pytest.mark.asyncio
async def test_handles_tool_calls_then_final_answer(mock_db):
    """LLM first calls get_patient_overview, then returns text."""
    llm = MockGeminiForAgentic(
        responses=[
            ToolCallResponse(
                text="",
                function_calls=[
                    {"id": "1", "name": "get_patient_overview", "args": {}},
                ],
                usage=LLMUsage(input_tokens=50, output_tokens=10),
                finish_reason=FinishReason.STOP,
            ),
            ToolCallResponse(
                text="The patient has 2 conditions and 5 observations.",
                function_calls=[],
                usage=LLMUsage(input_tokens=150, output_tokens=15),
                finish_reason=FinishReason.STOP,
            ),
        ],
    )
    strategy = AgenticStrategy(db=mock_db, llm_client=llm)

    with patch(
        "src.core.strategies.agentic.tool_executor.get_patient_overview",
        new_callable=AsyncMock,
        return_value={"by_type": [{"resource_type": "Condition", "count": 2}], "total_resources": 7},
    ):
        ctx = QueryContext(
            patient_id="p1",
            query_text="Summarize my health data.",
            strategy_name="agentic",
            model_name="gemini",
        )
        result = await strategy.execute(ctx)

    assert "conditions" in result.response_text.lower() or "observations" in result.response_text.lower()
    assert result.tokens_in > 0
    assert result.tokens_out > 0
