"""AgenticStrategy — main agentic loop with tool calling."""

import json
import time

from google.genai import types

from src.core.base_strategy import BaseStrategy
from src.core.models import QueryContext, QueryResult
from src.core.strategy_registry import register_strategy
from src.core.strategies.utils.constants import (
    MAX_SINGLE_RESULT_CHARS,
    MAX_TOTAL_TOOL_CHARS,
    MAX_TURNS,
)
from src.core.strategies.utils.prompts import BUDGET_EXCEEDED_PROMPT, SYSTEM_PROMPT
from src.core.strategies.utils.retry import retry_llm_call
from src.core.strategies.utils.tool_executor import ToolExecutor
from src.core.strategies.utils.tools import get_agentic_tools
from src.llm.providers.gemini import GeminiClient


@register_strategy("agentic")
class AgenticStrategy(BaseStrategy):
    """LLM navigates FHIR database via tools. Uses Gemini function calling."""

    @property
    def name(self) -> str:
        return "agentic"

    async def execute(self, context: QueryContext) -> QueryResult:

        try:
            t0 = time.perf_counter()
            tools = get_agentic_tools()
            executor = ToolExecutor(self.db, context.patient_id)

            # Build initial messages
            message = f"{SYSTEM_PROMPT}\n\nPatient question: {context.query_text}"
            messages: list[types.Content] = [types.Content(role="user", parts=[types.Part(text=message)])]

            all_resource_ids: list[str] = []
            total_tool_chars = 0
            total_tokens_in = len(message)
            total_tokens_out = 0
            seen_tool_calls: set[tuple[str, str]] = set()
            final_text = ""

            for turn in range(MAX_TURNS):
                async def _call():
                    return await self.llm_client.generate_with_tools(
                        contents=messages,
                        tools=tools,
                        max_tokens=context.max_tokens,
                        temperature=context.temperature,
                        use_tools=True,
                    )

                resp = await retry_llm_call(_call, call_description="agentic_llm_turn")

                total_tokens_in += resp.usage.input_tokens
                total_tokens_out += resp.usage.output_tokens
                final_text = resp.text

                if not resp.function_calls:
                    # No tool calls — model produced final answer
                    break

                # In your strategy loop, right after getting resp:
                self.logger.debug(
                    "raw_content_check | has_raw=%s | turn=%d",
                    resp.raw_model_content is not None,
                    turn + 1,
                )
                # Process function calls: execute tools, build function_responses.
                # Append the model's raw response (preserves thought_signature), then our responses.
                function_responses: list[types.Part] = []

                for fc in resp.function_calls:
                    fc_name = fc.get("name", "")
                    fc_args = fc.get("args", {})
                    args_key = (fc_name, json.dumps(fc_args, sort_keys=True))

                    if args_key in seen_tool_calls:
                        self.logger.info(
                            "duplicate_tool_call | turn=%d | tool=%s",
                            turn + 1,
                            fc_name,
                        )
                        result_json = json.dumps({"error": "Duplicate call skipped."})
                    else:
                        seen_tool_calls.add(args_key)
                        self.logger.info(
                            "tool_call | turn=%d | tool=%s | args=%s",
                            turn + 1,
                            fc_name,
                            str(fc_args)[:200],
                        )
                        result_json, resource_ids = await executor.execute(fc_name, fc_args)
                        all_resource_ids.extend(resource_ids)
                        total_tool_chars += len(result_json)

                        if len(result_json) > MAX_SINGLE_RESULT_CHARS:
                            self.logger.warning(
                                "tool_result_truncated | tool=%s | size=%d",
                                fc_name,
                                len(result_json),
                            )

                    try:
                        result_obj = json.loads(result_json)
                    except json.JSONDecodeError:
                        result_obj = {"result": result_json}
                    function_responses.append(
                        types.Part.from_function_response(
                            name=fc_name,
                            response=result_obj,
                        )
                    )

                # Append the model's original response (with thought signatures intact)
                if resp.raw_model_content:
                    messages.append(resp.raw_model_content)
                # Append your function responses
                messages.append(types.Content(role="user", parts=function_responses))

                # Context budget check after turn
                if total_tool_chars > MAX_TOTAL_TOOL_CHARS:
                    self.logger.warning(
                        "context_budget_exceeded | total_chars=%d | cap=%d",
                        total_tool_chars,
                        MAX_TOTAL_TOOL_CHARS,
                    )
                    messages.append(
                        types.Content(
                            role="user",
                            parts=[types.Part(text=BUDGET_EXCEEDED_PROMPT)],
                        ),
                    )
                    async def _final_call():
                        return await self.llm_client.generate_with_tools(
                            contents=messages,
                            tools=[],
                            max_tokens=context.max_tokens,
                            temperature=context.temperature,
                            use_tools=False,
                        )

                    final_resp = await retry_llm_call(_final_call, call_description="agentic_force_answer")
                    final_text = final_resp.text
                    total_tokens_in += final_resp.usage.input_tokens
                    total_tokens_out += final_resp.usage.output_tokens
                    break
            else:
                # Max turns reached without break
                if not final_text:
                    final_text = "Exploration was capped. I could not gather enough data to answer fully."

            latency_ms = (time.perf_counter() - t0) * 1000
            deduped_ids = list(dict.fromkeys(all_resource_ids))

            self.logger.info(
                "agent_complete | turns=%d | resources=%d | tokens_in=%d | tokens_out=%d | latency_ms=%.0f",
                min(turn + 1, MAX_TURNS),
                len(deduped_ids),
                total_tokens_in,
                total_tokens_out,
                latency_ms,
            )

            return QueryResult(
                response_text=final_text or "I could not generate an answer.",
                resource_ids=deduped_ids,
                model_used=self.llm_client.model_id,
                strategy_used=self.name,
                tokens_in=total_tokens_in,
                tokens_out=total_tokens_out,
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
