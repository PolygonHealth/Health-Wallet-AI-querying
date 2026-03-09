"""ConversationState for LangGraph. Uses LangChain messages and add_messages reducer."""

from typing import Annotated, TypedDict

from langgraph.graph import add_messages

QUERY_INTENT_RELEVANT = "relevant"
QUERY_INTENT_IRRELEVANT = "irrelevant"
QUERY_INTENT_NEEDS_CLARIFICATION = "needs_clarification"


class ConversationState(TypedDict, total=False):
    """All fields optional for incremental node updates."""

    messages: Annotated[list, add_messages]
    resource_ids: list[str]
    patient_id: str
    query_intent: str
    turn_count: int
    budget_exceeded: bool
    final_answer: str | None
