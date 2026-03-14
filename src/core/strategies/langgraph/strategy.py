import json
import logging
import time
from datetime import datetime

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.messages.base import BaseMessage
from langgraph.checkpoint.memory import MemorySaver
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.base_strategy import BaseStrategy
from src.core.models import QueryContext, QueryResult
from src.core.strategy_registry import register_strategy
from src.core.strategies.langgraph.graph import build_fhir_graph
from src.core.strategies.langgraph.state import ConversationState
from src.core.strategies.langgraph.tools import set_run_context
from src.core.strategies.utils.prompts import SYSTEM_PROMPT

logger = logging.getLogger(__name__)


def _extract_plain_text(content: str | list | dict | None) -> str:
    """Extract plain text from Gemini block format [{'type':'text','text':'...'}] or plain str."""
    if content is None:
        return ""
    if isinstance(content, str):
        s = content.strip()
        if not s:
            return ""
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


def _extract_final(messages: list[BaseMessage]) -> tuple[str, list[str]]:
    """Return (answer, resource_ids) from finish_with_answer ToolMessage or fallback to last AIMessage."""
    for msg in reversed(messages):
        if hasattr(msg, "name") and getattr(msg, "name", None) == "finish_with_answer":
            if hasattr(msg, "content") and msg.content:
                try:
                    data = json.loads(msg.content) if isinstance(msg.content, str) else msg.content
                    if isinstance(data, dict):
                        raw = data.get("answer", "")
                        answer = _extract_plain_text(raw).strip()
                        resource_ids = list(dict.fromkeys(data.get("resource_ids") or []))
                        if answer:
                            return answer, resource_ids
                except (json.JSONDecodeError, TypeError):
                    pass

    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
            content = getattr(msg, "content", None)
            answer = _extract_plain_text(content).strip()
            if answer:
                return answer, []

    return "Sorry, I could not generate an answer.", []


@register_strategy("langgraph")
class LanggraphStrategy(BaseStrategy):
    """Thin strategy wrapper. Graph is compiled once in __init__."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        llm: BaseChatModel,
        graph=None,
    ) -> None:
        self.session_factory = session_factory
        self.llm = llm
        self._graph = graph or build_fhir_graph(
            session_factory=session_factory,
            llm=llm,
            checkpointer=MemorySaver(),
        )

    @property
    def name(self) -> str:
        return "langgraph"

    async def execute(self, context: QueryContext) -> QueryResult:
        resource_types_collector: set[str] = set()
        set_run_context(context.patient_id, resource_types_collector)

        try:
            t0 = time.perf_counter()
            initial_state: ConversationState = {
                "messages": [
                    SystemMessage(
                        content=SYSTEM_PROMPT.format(
                            current_date=datetime.now().strftime("%B %d, %Y")
                        )
                    ),
                    HumanMessage(content=context.query_text),
                ],
                "patient_id": context.patient_id,
                "turn_count": 0,
                "tokens_in": 0,
                "tokens_out": 0,
            }

            config = {"configurable": {"thread_id": f"patient-{context.patient_id}"}}
            final_state = await self._graph.ainvoke(initial_state, config=config)

            messages = final_state.get("messages", [])
            answer, resource_ids = _extract_final(messages)
            latency_ms = (time.perf_counter() - t0) * 1000
            model_id = getattr(self.llm, "model", None) or "unknown"

            logger.info(
                "langgraph_complete | patient=%s | latency_ms=%.0f | resource_ids=%d | resource_types=%s",
                context.patient_id,
                latency_ms,
                len(resource_ids),
                len(resource_types_collector),
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
            error_message = str(e)
            if "429" in error_message or "RESOURCE_EXHAUSTED" in str(e).upper():
                error_message = "Model Rate limit exceeded. Please try again later."

            logger.error(
                "strategy_failed | strategy=%s | patient_id=%s | error=%s",
                self.name,
                context.patient_id,
                error_message,
            )

            return QueryResult(
                response_text="",
                resource_ids=[],
                error=error_message,
                resource_types=[],
                model_used=getattr(self.llm, "model", None) or "unknown",
                strategy_used=self.name,
            )
