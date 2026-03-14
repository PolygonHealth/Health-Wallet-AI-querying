"""Edge routing for LangGraph. Two routes: after classify and after llm."""

from langchain_core.messages import AIMessage

from src.core.strategies.langgraph.state import ConversationState
from src.core.strategies.utils.constants import MAX_TURNS


def route_after_llm(state: ConversationState) -> str:
    """Route after llm_node: tools or __end__. Go to tools if last AIMessage has tool_calls and turn_count < MAX_TURNS."""
    
    messages = state.get("messages") or []
    turn_count = state.get("turn_count", 0)
    if turn_count >= MAX_TURNS:
        return "__end__"
    if not messages:
        return "__end__"
    last = messages[-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return "__end__"
