"""LanggraphStrategy — LangGraph StateGraph with classify, tool loop, synthesize."""

import time

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.base_strategy import BaseStrategy
from src.core.models import QueryContext, QueryResult
from src.core.strategy_registry import register_strategy
from src.core.strategies.langgraph.edges import (
    route_after_call_tools,
    route_after_classify,
    route_after_execute_tools,
)
from src.core.strategies.langgraph.nodes.classify import create_classify_node
from src.core.strategies.langgraph.nodes.decline import decline_node
from src.core.strategies.langgraph.nodes.call_tools import create_call_tools_node
from src.core.strategies.langgraph.nodes.execute_tools import create_execute_tools_node
from src.core.strategies.langgraph.nodes.synthesize import create_synthesize_node
from src.core.strategies.langgraph.state import ConversationState
from src.llm.base_client import BaseLLMClient


@register_strategy("langgraph")
class LanggraphStrategy(BaseStrategy):
    """Enhanced agentic strategy with LangGraph: classification, decline paths, conversation memory."""

    def __init__(self, db: AsyncSession, llm_client: BaseLLMClient) -> None:
        super().__init__(db, llm_client)
        self._checkpointer = MemorySaver()


    @property
    def name(self) -> str:
        return "langgraph"

    def _build_graph(self, context: QueryContext):
        """Build and compile the LangGraph. Built per execute (context in closures)."""
        classify_n = create_classify_node(self.llm_client, context)
        call_tools_n = create_call_tools_node(self.llm_client, context)
        execute_tools_n = create_execute_tools_node(self.db, context)
        synthesize_n = create_synthesize_node(self.llm_client, context)

        builder = StateGraph(ConversationState)
        builder.add_node("classify", classify_n)
        builder.add_node("decline", decline_node)
        builder.add_node("call_tools", call_tools_n)
        builder.add_node("execute_tools", execute_tools_n)
        builder.add_node("synthesize", synthesize_n)

        builder.add_edge("__start__", "classify")
        builder.add_conditional_edges("classify", route_after_classify)
        builder.add_edge("decline", "__end__")
        builder.add_conditional_edges("call_tools", route_after_call_tools)
        builder.add_conditional_edges("execute_tools", route_after_execute_tools)
        builder.add_edge("synthesize", "__end__")

        return builder.compile(checkpointer=self._checkpointer)

    async def execute(self, context: QueryContext) -> QueryResult:
        try:
            t0 = time.perf_counter()
            graph = self._build_graph(context)

            first_message = f"Patient question: {context.query_text}"
            initial_messages = [{"role": "user", "parts": [{"text": first_message}]}]

            initial_state: ConversationState = {
                "messages": initial_messages,
                "patient_id": context.patient_id,
                "all_resource_ids": [],
                "total_tool_chars": 0,
                "turn_count": 0,
                "seen_tool_calls": [],
                "query_intent": "",
                "budget_exceeded": False,
                "final_answer": None,
                "tokens_in": len(first_message),
                "tokens_out": 0,
            }

            thread_id = f"patient-{context.patient_id}"
            config = {"configurable": {"thread_id": thread_id}}

            final_state = await graph.ainvoke(
                initial_state,
                config=config,
            )

            final_answer = final_state.get("final_answer") or "I could not generate an answer."
            all_resource_ids = final_state.get("all_resource_ids", [])
            deduped_ids = list(dict.fromkeys(all_resource_ids))
            tokens_in = final_state.get("tokens_in", 0)
            tokens_out = final_state.get("tokens_out", 0)
            latency_ms = (time.perf_counter() - t0) * 1000

            self.logger.info(
                "langgraph_complete | resources=%d | tokens_in=%d | tokens_out=%d | latency_ms=%.0f",
                len(deduped_ids),
                tokens_in,
                tokens_out,
                latency_ms,
            )

            return QueryResult(
                response_text=final_answer,
                resource_ids=deduped_ids,
                model_used=self.llm_client.model_id,
                strategy_used=self.name,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=latency_ms,
            )

        except Exception as e:
            self.logger.error(
                "strategy_failed | strategy=%s | patient_id=%s | error=%s",
                self.name,
                context.patient_id,
                str(e),
            )
            return QueryResult(
                response_text="",
                resource_ids=[],
                error=str(e),
            )
