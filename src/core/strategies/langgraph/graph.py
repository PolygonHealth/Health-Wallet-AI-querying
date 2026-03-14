import logging

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.strategies.langgraph.state import ConversationState
from src.core.strategies.langgraph.tools import create_fhir_tools
from src.core.strategies.utils.constants import MAX_TURNS

logger = logging.getLogger(__name__)


def _route_after_llm(state: ConversationState) -> str:
    """Route to tools if there are pending tool calls and budget remains, else end."""
    if state.get("turn_count", 0) >= MAX_TURNS:
        return "__end__"
    messages = state.get("messages") or []
    if not messages:
        return "__end__"
    last = messages[-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return "__end__"


def build_fhir_graph(
    session_factory: async_sessionmaker[AsyncSession],
    llm: BaseChatModel,
    checkpointer: MemorySaver | None = None,
):
    """Compile and return the FHIR agent graph.

    Call once at startup. The returned graph is safe to share across requests —
    per-request patient context is supplied via ContextVar in tools.py.

    Args:
        session_factory: Async SQLAlchemy session factory.
        llm:             Chat model. Will be bound to the tool list.
        checkpointer:    MemorySaver (or other) for conversation memory.
                         Defaults to a fresh MemorySaver if not provided.
    """
    if checkpointer is None:
        checkpointer = MemorySaver()

    tools = create_fhir_tools(session_factory)
    tool_node = ToolNode(tools)
    llm_with_tools = llm.bind_tools(tools)

    async def llm_node(state: ConversationState) -> dict:
        response = await llm_with_tools.ainvoke(state["messages"])
        delta_in = delta_out = 0
        usage = getattr(response, "usage_metadata", None)
        if usage:
            delta_in = usage.get("input_tokens", 0)
            delta_out = usage.get("output_tokens", 0)

        return {
            "messages": [response],
            "turn_count": state.get("turn_count", 0) + 1,
            "tokens_in": state.get("tokens_in", 0) + delta_in,
            "tokens_out": state.get("tokens_out", 0) + delta_out,
        }

    builder = StateGraph(ConversationState)
    builder.add_node("llm", llm_node)
    builder.add_node("tools", tool_node)

    builder.add_edge("__start__", "llm")
    builder.add_edge("tools", "llm")
    builder.add_conditional_edges("llm", _route_after_llm)

    compiled = builder.compile(checkpointer=checkpointer)
    logger.info("fhir_graph_compiled | tools=%d", len(tools))
    return compiled
