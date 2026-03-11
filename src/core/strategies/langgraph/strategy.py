"""LanggraphStrategy — LangGraph with classify, llm+tools loop, synthesize."""

from datetime import datetime
import logging
import time

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.models import QueryContext, QueryResult
from src.core.strategy_registry import register_strategy
from src.core.strategies.langgraph.edges import route_after_classify, route_after_llm
from src.core.strategies.langgraph.nodes.classify import create_classify_node
from src.core.strategies.langgraph.nodes.decline import decline_node
from src.core.strategies.langgraph.nodes.synthesize import create_synthesize_node
from src.core.strategies.langgraph.state import ConversationState
from src.core.strategies.langgraph.tools import create_fhir_tools
from src.core.strategies.utils.prompts import SYSTEM_PROMPT

logger = logging.getLogger(__name__)


@register_strategy("langgraph")
class LanggraphStrategy:
    """LangGraph strategy: BaseChatModel, ToolNode, add_messages state."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession], llm: BaseChatModel) -> None:
        self.session_factory = session_factory
        self.llm = llm
        self._checkpointer = MemorySaver()

    @property
    def name(self) -> str:
        return "langgraph"

    def _build_graph(
        self, context: QueryContext, resource_types_collector: set[str] | None = None
    ):
        """Build graph per execute. Tools use context.patient_id."""
        tools = create_fhir_tools(
            self.session_factory, context.patient_id, resource_types_collector=resource_types_collector
        )
        tool_node = ToolNode(tools)
        llm_with_tools = self.llm.bind_tools(tools)

        classify_n = create_classify_node(self.llm)
        synthesize_n = create_synthesize_node(self.llm)

        async def llm_node(state: ConversationState) -> dict:
            response = await llm_with_tools.ainvoke(state["messages"])

            # Extract token usage from response metadata
            delta_in = 0
            delta_out = 0
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
        builder.add_node("synthesize", synthesize_n)

        builder.add_edge("__start__", "llm")
        builder.add_conditional_edges("llm", route_after_llm)
        builder.add_edge("tools", "llm")  # tools -> llm (loop)
        builder.add_edge("synthesize", "__end__")

        return builder.compile(checkpointer=self._checkpointer)

    async def execute(self, context: QueryContext) -> QueryResult:
        try:
            t0 = time.perf_counter()
            resource_types_collector: set[str] = set()
            graph = self._build_graph(context, resource_types_collector)

            initial_messages = [
                SystemMessage(content=SYSTEM_PROMPT.format(
                    current_date=datetime.now().strftime('%B %d, %Y')
                )),
                HumanMessage(content=context.query_text),
            ]
            initial_state: ConversationState = {
                "messages": initial_messages,
                "patient_id": context.patient_id,
                "turn_count": 0,
                "query_intent": "",
                "budget_exceeded": False,
                "final_answer": None,
                "tokens_in": 0,
                "tokens_out": 0,
            }

            thread_id = f"patient-{context.patient_id}"
            config = {"configurable": {"thread_id": thread_id}}

            final_state = await graph.ainvoke(initial_state, config=config)

            final_answer = final_state.get("final_answer") or "I could not generate an answer."
            resource_ids = final_state.get("resource_ids", [])
            latency_ms = (time.perf_counter() - t0) * 1000

            model_id = getattr(self.llm, "model", None) or "unknown"
            logger.info(
                "langgraph_complete | latency_ms=%.0f",
                latency_ms,
            )

            return QueryResult(
                response_text=final_answer,
                resource_ids=resource_ids,
                model_used=model_id,
                strategy_used=self.name,
                latency_ms=latency_ms,
                tokens_in=final_state.get("tokens_in", 0),
                tokens_out=final_state.get("tokens_out", 0),
                resource_types=sorted(resource_types_collector),
            )

        except Exception as e:
            logger.error(
                "strategy_failed | strategy=%s | patient_id=%s | error=%s",
                self.name,
                context.patient_id,
                str(e),
            )
            return QueryResult(
                response_text="",
                resource_ids=[],
                error=str(e),
                resource_types=[],
            )
