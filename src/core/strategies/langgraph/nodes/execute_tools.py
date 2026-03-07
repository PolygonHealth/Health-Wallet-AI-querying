"""Execute_tools node: run tool calls and append results to messages."""

import json
import logging

from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models import QueryContext
from src.core.strategies.utils.constants import (
    MAX_SINGLE_RESULT_CHARS,
    MAX_TOTAL_TOOL_CHARS,
    MAX_TURNS,
)
from src.core.strategies.utils.tool_executor import ToolExecutor
from src.core.strategies.langgraph.state import (
    ConversationState,
    content_to_dict,
)

logger = logging.getLogger(__name__)


def _extract_function_calls_from_messages(messages: list[dict]) -> list[dict]:
    """Extract function_calls from last message parts."""
    if not messages:
        return []
    last = messages[-1]
    calls: list[dict] = []
    for p in last.get("parts", []):
        if "function_call" in p:
            calls.append(p["function_call"])
    return calls


def create_execute_tools_node(db: AsyncSession, context: QueryContext):
    """Factory: returns async node that executes tool calls."""

    async def execute_tools_node(state: ConversationState) -> dict:
        messages = state.get("messages", [])
        seen_list = state.get("seen_tool_calls", [])
        all_resource_ids = list(state.get("all_resource_ids", []))
        total_tool_chars = state.get("total_tool_chars", 0)
        turn_count = state.get("turn_count", 0)
        patient_id = state.get("patient_id", context.patient_id)

        seen_set = set(seen_list)
        executor = ToolExecutor(db, patient_id)
        function_calls = _extract_function_calls_from_messages(messages)
        function_responses: list[types.Part] = []

        for fc in function_calls:
            fc_name = fc.get("name", "")
            fc_args = fc.get("args", {})
            args_key = json.dumps((fc_name, fc_args), sort_keys=True)

            if args_key in seen_set:
                logger.info(
                    "duplicate_tool_call | turn=%d | tool=%s",
                    turn_count,
                    fc_name,
                )
                result_json = json.dumps({"error": "Duplicate call skipped."})
            else:
                seen_set.add(args_key)
                logger.info(
                    "tool_call | turn=%d | tool=%s | args=%s",
                    turn_count,
                    fc_name,
                    str(fc_args)[:200],
                )
                result_json, resource_ids = await executor.execute(fc_name, fc_args)
                all_resource_ids.extend(resource_ids)
                total_tool_chars += len(result_json)

                if len(result_json) > MAX_SINGLE_RESULT_CHARS:
                    logger.warning(
                        "tool_result_truncated | tool=%s | size=%d",
                        fc_name,
                        len(result_json),
                    )

            try:
                result_obj = json.loads(result_json)
            except json.JSONDecodeError:
                result_obj = {"result": result_json}
            function_responses.append(
                types.Part.from_function_response(name=fc_name, response=result_obj),
            )

        user_content = types.Content(role="user", parts=function_responses)
        new_messages = list(messages)
        new_messages.append(content_to_dict(user_content))

        budget_exceeded = (
            total_tool_chars > MAX_TOTAL_TOOL_CHARS or turn_count >= MAX_TURNS
        )
        if budget_exceeded:
            logger.warning(
                "context_budget_exceeded | total_chars=%d | cap=%d | turns=%d",
                total_tool_chars,
                MAX_TOTAL_TOOL_CHARS,
                turn_count,
            )

        return {
            "messages": new_messages,
            "seen_tool_calls": list(seen_set),
            "all_resource_ids": all_resource_ids,
            "total_tool_chars": total_tool_chars,
            "budget_exceeded": budget_exceeded,
        }

    return execute_tools_node