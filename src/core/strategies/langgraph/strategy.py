"""LanggraphStrategy — LangGraph with llm+tools loop. No synthesize node; finish_with_answer ends."""

import json
import logging
import time
from datetime import datetime

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.models import QueryContext, QueryResult
from src.core.strategy_registry import register_strategy
from src.core.strategies.langgraph.edges import route_after_llm
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

        builder.add_edge("__start__", "llm")
        builder.add_edge("tools", "llm")  # tools -> llm (loop)
        builder.add_conditional_edges("llm", route_after_llm) # check number of turns < MAX_TURNS

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
            messages = final_state.get("messages", [])
            answer, resource_ids, _ = _extract_final_from_messages(messages)
            latency_ms = (time.perf_counter() - t0) * 1000

            model_id = getattr(self.llm, "model", None) or "unknown"
            logger.info(
                "langgraph_complete | latency_ms=%.0f",
                latency_ms,
            )

            return QueryResult(
                response_text=answer,
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

    def _extract_plain_text(self, content: str | list | dict | None) -> str:
        """Extract plain text from content that may be Gemini block format [{'type':'text','text':'...'}] or plain str."""
        if content is None:
            return ""
        if isinstance(content, str):
            s = content.strip()
            if not s:
                return ""
            # Try parsing as JSON in case it's stringified list of blocks
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    parts = []
                    for block in parsed:
                        if isinstance(block, dict) and "text" in block:
                            parts.append(str(block["text"]))
                        elif isinstance(block, str):
                            parts.append(block)
                    return "\n".join(parts).strip() if parts else s
            except (json.JSONDecodeError, TypeError):
                pass
            return s
            
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict) and "text" in block:
                    parts.append(str(block["text"]))
                elif isinstance(block, str):
                    parts.append(block)
            return "\n".join(parts).strip()
        if isinstance(content, dict) and "text" in content:
            return str(content["text"]).strip()
        return str(content).strip() if content else ""


    def _extract_final_from_messages(self, messages: list[BaseMessage]) -> tuple[str, list[str], list[str]]:
        """Extract final_answer, resource_ids, and resource_types from conversation messages."""
        final_answer = ""
        resource_ids: list[str] = []
        resource_types: list[str] = []

        for m in reversed(messages):
            if hasattr(m, "name") and getattr(m, "name", None) == "finish_with_answer":
                if hasattr(m, "content") and m.content:
                    try:
                        data = json.loads(m.content) if isinstance(m.content, str) else m.content
                        if isinstance(data, dict):
                            raw = data.get("answer", "")
                            final_answer = self._extract_plain_text(raw)
                            resource_ids = list(data.get("resource_ids") or [])
                            resource_types = list(data.get("resource_types") or [])
                            break
                    except (json.JSONDecodeError, TypeError):
                        pass

        if not final_answer:
            for m in reversed(messages):
                if hasattr(m, "content") and not (getattr(m, "tool_calls", None) or []):
                    c = getattr(m, "content", None)
                    final_answer = self._extract_plain_text(c)
                    if final_answer:
                        break

        if not resource_ids:
            for m in messages:
                if hasattr(m, "content") and m.content:
                    try:
                        data = json.loads(m.content) if isinstance(m.content, str) else {}
                        if isinstance(data, dict):
                            for r in data.get("resources", data.get("rows", [])):
                                if isinstance(r, dict) and r.get("resource_id"):
                                    resource_ids.append(str(r["resource_id"]))
                    except (json.JSONDecodeError, TypeError):
                        pass

        plain = self._extract_plain_text(final_answer).strip() or "Sorry, I could not generate an answer."
        return plain, list(dict.fromkeys(resource_ids)), list(dict.fromkeys(resource_types))

