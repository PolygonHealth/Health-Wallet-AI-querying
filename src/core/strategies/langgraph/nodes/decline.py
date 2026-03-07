"""Decline node: templated response for irrelevant or needs_clarification."""

from src.core.strategies.langgraph.state import (
    QUERY_INTENT_IRRELEVANT,
    ConversationState,
)

IRRELEVANT_MESSAGE = (
    "I'm designed to help with your health records. You could try asking about "
    "your conditions, medications, lab results, or clinical notes."
)
NEEDS_CLARIFICATION_MESSAGE = (
    "Could you be more specific? For example, you could ask about a specific "
    "condition, medication, or time period."
)


def decline_node(state: ConversationState) -> dict:
    """Pure node: set final_answer based on query_intent. No deps."""
    intent = state.get("query_intent")
    if intent == QUERY_INTENT_IRRELEVANT:
        final_answer = IRRELEVANT_MESSAGE
    else:
        final_answer = NEEDS_CLARIFICATION_MESSAGE
    return {"final_answer": final_answer}
