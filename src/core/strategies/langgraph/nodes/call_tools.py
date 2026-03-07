"""Call_tools node: LLM generates tool calls or final text."""

from src.core.models import QueryContext
from src.core.strategies.utils.retry import retry_llm_call
from src.core.strategies.utils.tools import get_agentic_tools
from src.core.strategies.langgraph.state import (
    ConversationState,
    content_to_dict,
    contents_from_state_messages,
)


def create_call_tools_node(llm_client, context: QueryContext):
    """Factory: returns async node that calls LLM with tools."""

    async def call_tools_node(state: ConversationState) -> dict:
        messages = state.get("messages", [])
        turn_count = state.get("turn_count", 0) + 1
        tokens_in = state.get("tokens_in", 0)
        tokens_out = state.get("tokens_out", 0)

        contents = contents_from_state_messages(messages)

        tools = get_agentic_tools()

        async def _call():
            return await llm_client.generate_with_tools(
                contents=contents,
                tools=tools,
                max_tokens=context.max_tokens,
                temperature=context.temperature,
                use_tools=True,
            )

        resp = await retry_llm_call(_call, call_description="langgraph_call_tools")
        tokens_in += resp.usage.input_tokens
        tokens_out += resp.usage.output_tokens

        new_messages = list(messages)
        if resp.raw_model_content:
            new_messages.append(content_to_dict(resp.raw_model_content))
        else:
            parts: list[dict] = []
            if resp.text:
                parts.append({"text": resp.text})
            for fc in resp.function_calls or []:
                parts.append({
                    "function_call": {
                        "name": fc.get("name", ""),
                        "args": fc.get("args", {}),
                    },
                })
            new_messages.append({"role": "model", "parts": parts})

        return {
            "messages": new_messages,
            "turn_count": turn_count,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
        }

    return call_tools_node
