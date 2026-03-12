"""Edge routing for LangGraph. Two routes: after classify and after llm."""

from langchain_core.messages import AIMessage

from src.core.strategies.langgraph.state import (
    QUERY_INTENT_IRRELEVANT,
    QUERY_INTENT_NEEDS_CLARIFICATION,
    ConversationState,
)
from src.core.strategies.utils.constants import MAX_TURNS


def route_after_classify(state: ConversationState) -> str:
    """Route after classify: decline or llm."""
    intent = state.get("query_intent", "relevant")
    if intent in (QUERY_INTENT_IRRELEVANT, QUERY_INTENT_NEEDS_CLARIFICATION):
        return "decline"
    return "llm"


def route_after_llm(state: ConversationState) -> str:
    """Route after llm_node: tools or synthesize. Go to tools if last AIMessage has tool_calls and turn_count < MAX_TURNS."""
    messages = state.get("messages") or []
    turn_count = state.get("turn_count", 0)
    if turn_count >= MAX_TURNS:
        return "synthesize"
    if not messages:
        return "synthesize"
    last = messages[-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return "synthesize"
