import logging
from typing import Literal

from pydantic import BaseModel

from src.core.models import QueryContext
from src.core.strategies.langgraph.prompts import CLASSIFY_PROMPT
from src.core.strategies.utils.retry import retry_llm_call
from src.core.strategies.langgraph.state import (
    QUERY_INTENT_RELEVANT,
    ConversationState,
)

logger = logging.getLogger(__name__)


class ClassifyResult(BaseModel):
    """Structured output schema for query classification."""

    intent: Literal["relevant", "irrelevant", "needs_clarification"]
    reason: str


def _format_messages_for_classify(messages: list[dict]) -> str:
    """Format state messages as readable text for classify prompt."""

    lines: list[str] = []
    for m in messages:
        role = m.get("role", "user")
        for p in m.get("parts", []):
            if "text" in p:
                lines.append(f"{role.capitalize()}: {p['text']}")
    return "\n".join(lines) if lines else "(no messages)"


def create_classify_node(llm_client, context: QueryContext):
    """Factory: returns async node that classifies query intent."""

    async def classify_node(state: ConversationState) -> dict:
        messages = state.get("messages", [])
        conv_text = _format_messages_for_classify(messages)
        prompt = f"{CLASSIFY_PROMPT}\n\n---\nConversation:\n{conv_text}"

        intent = QUERY_INTENT_RELEVANT  # default: fail open

        try:
            async def _call():
                return await llm_client.complete(
                    prompt=prompt,
                    max_tokens=1000,
                    temperature=0.0,
                    response_schema=ClassifyResult,
                )

            resp = await retry_llm_call(_call, call_description="langgraph_classify")
            result = ClassifyResult.model_validate_json(resp.response)
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