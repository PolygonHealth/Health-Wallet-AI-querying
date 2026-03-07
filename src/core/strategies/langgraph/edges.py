"""Edge routing functions for LangGraph."""

from src.core.strategies.langgraph.state import (
    QUERY_INTENT_IRRELEVANT,
    QUERY_INTENT_NEEDS_CLARIFICATION,
    ConversationState,
)


def _last_message_has_function_calls(state: ConversationState) -> bool:
    """Check if last message has any function_call parts."""
    messages = state.get("messages", [])
    if not messages:
        return False
    for p in messages[-1].get("parts", []):
        if "function_call" in p:
            return True
    return False


def route_after_classify(state: ConversationState) -> str:
    """Route after classify: decline or call_tools."""
    intent = state.get("query_intent", "relevant")
    if intent in (QUERY_INTENT_IRRELEVANT, QUERY_INTENT_NEEDS_CLARIFICATION):
        return "decline"
    return "call_tools"


def route_after_call_tools(state: ConversationState) -> str:
    """Route after call_tools: execute_tools or synthesize."""
    if _last_message_has_function_calls(state):
        return "execute_tools"
    return "synthesize"


def route_after_execute_tools(state: ConversationState) -> str:
    """Route after execute_tools: call_tools (loop) or synthesize."""
    if state.get("budget_exceeded", False):
        return "synthesize"
    return "call_tools"
