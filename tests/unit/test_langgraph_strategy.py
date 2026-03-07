"""Unit tests for LangGraph strategy nodes and edges."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.models import QueryContext
from src.core.strategies.langgraph.edges import (
    route_after_call_tools,
    route_after_classify,
    route_after_execute_tools,
)
from src.core.strategies.langgraph.nodes.decline import decline_node
from src.core.strategies.langgraph.state import (
    QUERY_INTENT_IRRELEVANT,
    QUERY_INTENT_NEEDS_CLARIFICATION,
    QUERY_INTENT_RELEVANT,
    ConversationState,
)


def test_route_after_classify_relevant():
    state: ConversationState = {"query_intent": QUERY_INTENT_RELEVANT}
    assert route_after_classify(state) == "call_tools"


def test_route_after_classify_irrelevant():
    state: ConversationState = {"query_intent": QUERY_INTENT_IRRELEVANT}
    assert route_after_classify(state) == "decline"


def test_route_after_classify_needs_clarification():
    state: ConversationState = {"query_intent": QUERY_INTENT_NEEDS_CLARIFICATION}
    assert route_after_classify(state) == "decline"


def test_route_after_call_tools_with_function_calls():
    state: ConversationState = {
        "messages": [
            {"role": "user", "parts": [{"text": "q"}]},
            {"role": "model", "parts": [{"function_call": {"name": "foo", "args": {}}}]},
        ],
    }
    assert route_after_call_tools(state) == "execute_tools"


def test_route_after_call_tools_no_function_calls():
    state: ConversationState = {
        "messages": [
            {"role": "user", "parts": [{"text": "q"}]},
            {"role": "model", "parts": [{"text": "answer"}]},
        ],
    }
    assert route_after_call_tools(state) == "synthesize"


def test_route_after_execute_tools_budget_ok():
    state: ConversationState = {"budget_exceeded": False}
    assert route_after_execute_tools(state) == "call_tools"


def test_route_after_execute_tools_budget_exceeded():
    state: ConversationState = {"budget_exceeded": True}
    assert route_after_execute_tools(state) == "synthesize"


def test_decline_node_irrelevant():
    state: ConversationState = {"query_intent": QUERY_INTENT_IRRELEVANT}
    result = decline_node(state)
    assert "final_answer" in result
    assert "health records" in result["final_answer"]


def test_decline_node_needs_clarification():
    state: ConversationState = {"query_intent": QUERY_INTENT_NEEDS_CLARIFICATION}
    result = decline_node(state)
    assert "final_answer" in result
    assert "specific" in result["final_answer"]


@pytest.mark.asyncio
async def test_langgraph_strategy_execute_returns_query_result():
    """Smoke test: LanggraphStrategy.execute returns QueryResult with mock LLM."""
    from src.llm.base_client import FinishReason, LLMUsage
    from src.llm.providers.gemini import ToolCallResponse

    from src.core.strategies.langgraph.strategy import LanggraphStrategy

    mock_db = AsyncMock()
    mock_llm = MagicMock()
    mock_llm.model_id = "langgraph-mock"
    mock_llm.generate_with_tools = AsyncMock(
        side_effect=[
            ToolCallResponse(
                text='{"intent": "relevant", "reason": "Health question", "suggestion": ""}',
                function_calls=[],
                usage=LLMUsage(input_tokens=80, output_tokens=30),
                finish_reason=FinishReason.STOP,
            ),
            ToolCallResponse(
                text="",
                function_calls=[{"name": "get_patient_overview", "args": {}}],
                usage=LLMUsage(input_tokens=150, output_tokens=5),
                finish_reason=FinishReason.STOP,
            ),
            ToolCallResponse(
                text="The patient has hypertension.",
                function_calls=[],
                usage=LLMUsage(input_tokens=200, output_tokens=10),
                finish_reason=FinishReason.STOP,
            ),
        ],
    )

    strategy = LanggraphStrategy(db=mock_db, llm_client=mock_llm)
    mock_exec = AsyncMock()
    mock_exec.execute = AsyncMock(
        return_value=('{"resources": [], "count": 0}', []),
    )
    with patch(
        "src.core.strategies.langgraph.nodes.execute_tools.ToolExecutor",
        return_value=mock_exec,
    ):
        context = QueryContext(
            patient_id="p1",
            query_text="What conditions do I have?",
            strategy_name="langgraph",
            model_name="langgraph-mock",
        )
        result = await strategy.execute(context)

    assert result.response_text
    assert result.strategy_used == "langgraph"
    assert result.resource_ids is not None
