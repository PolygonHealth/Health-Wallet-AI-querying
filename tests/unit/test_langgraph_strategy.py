"""Unit tests for LangGraph strategy nodes and edges."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from langchain_core.messages import AIMessage

from src.core.models import QueryContext
from src.core.strategies.langgraph.edges import route_after_classify, route_after_llm
from src.core.strategies.langgraph.nodes.decline import decline_node
from src.core.strategies.langgraph.state import (
    QUERY_INTENT_IRRELEVANT,
    QUERY_INTENT_NEEDS_CLARIFICATION,
    QUERY_INTENT_RELEVANT,
    ConversationState,
)


def test_route_after_classify_relevant():
    state: ConversationState = {"query_intent": QUERY_INTENT_RELEVANT}
    assert route_after_classify(state) == "llm"


def test_route_after_classify_irrelevant():
    state: ConversationState = {"query_intent": QUERY_INTENT_IRRELEVANT}
    assert route_after_classify(state) == "decline"


def test_route_after_classify_needs_clarification():
    state: ConversationState = {"query_intent": QUERY_INTENT_NEEDS_CLARIFICATION}
    assert route_after_classify(state) == "decline"


def test_route_after_llm_with_tool_calls():
    state: ConversationState = {
        "messages": [
            AIMessage(content="q"),
            AIMessage(content="", tool_calls=[{"id": "1", "name": "foo", "args": {}}]),
        ],
        "turn_count": 1,
    }
    assert route_after_llm(state) == "tools"


def test_route_after_llm_no_tool_calls():
    state: ConversationState = {
        "messages": [
            AIMessage(content="q"),
            AIMessage(content="The answer is X."),
        ],
        "turn_count": 1,
    }
    assert route_after_llm(state) == "synthesize"


def test_route_after_llm_max_turns():
    from src.core.strategies.utils.constants import MAX_TURNS

    state: ConversationState = {
        "messages": [
            AIMessage(content="", tool_calls=[{"id": "1", "name": "foo", "args": {}}]),
        ],
        "turn_count": MAX_TURNS,
    }
    assert route_after_llm(state) == "synthesize"


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
    """Smoke test: LanggraphStrategy.execute returns QueryResult with mock LLM and tools."""
    from tests.mocks.mock_langchain_llm import MockLangChainLLM

    from src.core.strategies.langgraph.strategy import LanggraphStrategy

    mock_db = AsyncMock()
    mock_llm = MockLangChainLLM()

    mock_executor = AsyncMock()
    mock_executor.execute = AsyncMock(return_value=('{"resources": [], "count": 0}', []))

    with patch(
        "src.core.strategies.langgraph.strategy.create_fhir_tools",
        return_value=[],  # No tools - LLM will return final answer on first call
    ):
        # Use mock that returns final answer immediately (no tool calls) to avoid DB
        mock_llm._llm_responses = [
            AIMessage(content="The patient has hypertension.", tool_calls=[]),
        ]
        strategy = LanggraphStrategy(db=mock_db, llm=mock_llm)
        context = QueryContext(
            patient_id="p1",
            query_text="What conditions do I have?",
            strategy_name="langgraph",
            model_name="langgraph-mock",
        )
        result = await strategy.execute(context)

    assert result.response_text
    assert result.strategy_used == "langgraph"
    assert result.resource_ids == []
