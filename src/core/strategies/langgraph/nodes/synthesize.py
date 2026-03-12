"""Synthesize node: produce final answer with cited resource IDs via structured output."""

import logging
from typing import Annotated

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field

from src.core.strategies.langgraph.state import ConversationState
from src.core.strategies.utils.prompts import BUDGET_EXCEEDED_PROMPT
from src.core.strategies.utils.retry import retry_llm_call

logger = logging.getLogger(__name__)


class SynthesizedAnswer(BaseModel):
    """Structured output for the final synthesized answer."""

    answer: str = Field(
        description="The final plain-English answer to the patient's question."
    )
    resource_ids: list[str] = Field(
        default_factory=list,
        description=(
            "List of FHIR resource_id UUIDs that were directly used to form this answer. "
            "Only include IDs that the answer references or relies on. "
            "These appear as 'resource_id' fields in tool results."
        ),
    )


SYNTHESIZE_INSTRUCTION = (
    "Now produce your final answer to the patient's question based on the data retrieved. "
    "Return a JSON object with two fields:\n"
    '- "answer": your plain-English response to the patient, citing specific data points.\n'
    '- "resource_ids": a list of resource_id UUIDs from the tool results that you '
    "directly used to form the answer. Only include IDs you actually reference or rely on."
)


def _extract_text(message: AIMessage) -> str:
    """Provider-agnostic text extraction from AIMessage content."""
    if message is None:
        return ""
    content = message.content
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and "text" in block:
                parts.append(block["text"])
        return "\n".join(parts).strip()
    return ""


def create_synthesize_node(llm: BaseChatModel):
    """Factory: returns async node that produces final_answer + resource_ids."""

    structured_llm = llm.with_structured_output(SynthesizedAnswer, include_raw=True)

    async def synthesize_node(state: ConversationState) -> dict:
        messages = list(state.get("messages") or [])
        budget_exceeded = state.get("budget_exceeded", False)

        # Check if the last AI message already has a text answer (no tool calls)
        # If so, we still run structured synthesis to extract resource_ids
        last_ai_text = ""
        for m in reversed(messages):
            if isinstance(m, AIMessage) and not (m.tool_calls or []):
                last_ai_text = _extract_text(m)
                break

        # Always run structured synthesis to get resource_ids
        instruction = SYNTHESIZE_INSTRUCTION
        if budget_exceeded:
            instruction = BUDGET_EXCEEDED_PROMPT + "\n\n" + instruction

        combined = messages + [HumanMessage(content=instruction)]

        async def _call():
            return await structured_llm.ainvoke(combined)

        try:
            raw_result: SynthesizedAnswer = await retry_llm_call(
                _call, call_description="langgraph_synthesize"
            )
            result = raw_result['parsed']
            raw_message = raw_result['raw'] # AIMessage with usage_metadata

            final_answer = result.answer
            resource_ids = result.resource_ids

            # Extract synthesis token usage if available
            usage = getattr(raw_result, "usage_metadata", None) or {}
            synth_in = usage.get("input_tokens", 0)
            synth_out = usage.get("output_tokens", 0)
        except Exception as e:
            logger.warning(
                "structured_synthesize_failed | falling_back_to_text | error=%s",
                str(e),
            )
            final_answer = last_ai_text
            resource_ids = []
            synth_in = 0
            synth_out = 0

        resource_ids = list(dict.fromkeys(resource_ids))

        logger.info(
            "synthesize_complete | resource_ids=%d | budget_exceeded=%s",
            len(resource_ids),
            budget_exceeded,
        )

        return {
            "final_answer": final_answer or "I could not generate an answer.",
            "resource_ids": resource_ids,
            "tokens_in": state.get("tokens_in", 0) + synth_in,
            "tokens_out": state.get("tokens_out", 0) + synth_out,
        }
    return synthesize_node