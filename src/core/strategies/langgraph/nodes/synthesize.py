"""Synthesize node: produce final answer, with optional budget-exceeded forced call."""

import logging

from src.core.models import QueryContext
from src.core.strategies.utils.prompts import BUDGET_EXCEEDED_PROMPT
from src.core.strategies.utils.retry import retry_llm_call
from src.core.strategies.langgraph.state import (
    ConversationState,
    contents_from_state_messages,
)

logger = logging.getLogger(__name__)


def _extract_text_from_last_message(messages: list[dict]) -> str:
    """Extract text from last message parts."""
    if not messages:
        return ""
    for p in messages[-1].get("parts", []):
        if "text" in p:
            return p["text"]
    return ""


def create_synthesize_node(llm_client, context: QueryContext):
    """Factory: returns async node that produces final_answer."""

    async def synthesize_node(state: ConversationState) -> dict:
        messages = state.get("messages", [])
        budget_exceeded = state.get("budget_exceeded", False)
        tokens_in = state.get("tokens_in", 0)
        tokens_out = state.get("tokens_out", 0)

        if budget_exceeded:
            prepend_msg = {"role": "user", "parts": [{"text": BUDGET_EXCEEDED_PROMPT}]}
            combined = [prepend_msg] + list(messages)
            contents_for_llm = contents_from_state_messages(combined)

            async def _call():
                return await llm_client.generate_with_tools(
                    contents=contents_for_llm,
                    tools=[],
                    max_tokens=context.max_tokens,
                    temperature=context.temperature,
                    use_tools=False,
                )

            resp = await retry_llm_call(_call, call_description="langgraph_synthesize")
            final_answer = resp.text or ""
            tokens_in += resp.usage.input_tokens
            tokens_out += resp.usage.output_tokens
        else:
            final_answer = _extract_text_from_last_message(messages)
            if not final_answer:
                final_answer = "I could not generate an answer."

        return {
            "final_answer": final_answer,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
        }

    return synthesize_node
