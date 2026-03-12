"""Classify node: determine query intent using structured LLM output."""

import logging
from typing import Literal

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage
from pydantic import BaseModel

from src.core.strategies.langgraph.prompts import CLASSIFY_PROMPT
from src.core.strategies.langgraph.state import (
    QUERY_INTENT_RELEVANT,
    ConversationState,
)
from src.core.strategies.utils.retry import retry_llm_call

logger = logging.getLogger(__name__)


class ClassifyResult(BaseModel):
    """Structured output schema for query classification."""

    intent: Literal["relevant", "irrelevant", "needs_clarification"]
    reason: str


def _format_messages_for_classify(messages: list[BaseMessage]) -> str:
    """Format state messages as readable text for classify prompt."""
    lines: list[str] = []
    for m in messages:
        role = "user" if isinstance(m, HumanMessage) else "assistant"
        content = getattr(m, "content", None)
        if isinstance(content, str) and content.strip():
            lines.append(f"{role.capitalize()}: {content}")
    return "\n".join(lines) if lines else "(no messages)"


def create_classify_node(llm: BaseChatModel):
    """Factory: returns async node that classifies query intent using structured output."""

    async def classify_node(state: ConversationState) -> dict:
        messages = state.get("messages", [])
        conv_text = _format_messages_for_classify(messages)
        prompt = f"{CLASSIFY_PROMPT}\n\n---\nConversation:\n{conv_text}"

        intent = QUERY_INTENT_RELEVANT  # default: fail open

        try:
            structured_llm = llm.with_structured_output(ClassifyResult)

            async def _call():
                return await structured_llm.ainvoke([HumanMessage(content=prompt)])

            result = await retry_llm_call(_call, call_description="langgraph_classify")
            intent = result.intent

            logger.info(
                "classify_result | intent=%s | reason=%s",
                result.intent,
                result.reason,
            )

        except Exception as e:
            logger.warning(
                "classify_failed | defaulting_to_relevant | error=%s",
                str(e),
            )

        return {"query_intent": intent}

    return classify_node
