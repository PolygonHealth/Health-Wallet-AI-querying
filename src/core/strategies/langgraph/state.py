"""ConversationState TypedDict and message serialization for LangGraph checkpointer."""

from typing import TypedDict

from google.genai import types

# Intent literals — use these instead of magic strings
QUERY_INTENT_RELEVANT = "relevant"
QUERY_INTENT_IRRELEVANT = "irrelevant"
QUERY_INTENT_NEEDS_CLARIFICATION = "needs_clarification"


class ConversationState(TypedDict, total=False):
    """State for the LangGraph conversation. All fields optional for incremental updates."""

    messages: list[dict]  # JSON-serializable: {"role": str, "parts": list}
    patient_id: str
    all_resource_ids: list[str]
    total_tool_chars: int
    turn_count: int
    seen_tool_calls: list[str]  # JSON-serializable keys; NOT set
    query_intent: str
    budget_exceeded: bool
    final_answer: str | None
    tokens_in: int
    tokens_out: int


def content_to_dict(content: types.Content) -> dict:
    """Convert Gemini Content to JSON-serializable dict for checkpointer."""
    parts: list[dict] = []
    if content.parts:
        for p in content.parts:
            if getattr(p, "text", None):
                parts.append({"text": p.text})
            if getattr(p, "function_call", None):
                fc = p.function_call
                part_dict = {
                    "function_call": {
                        "name": getattr(fc, "name", None) or "",
                        "args": dict(getattr(fc, "args", None) or {}),
                    },
                }
                # Preserve thought_signature if present
                if getattr(p, "thought_signature", None):
                    part_dict["function_call"]["thought_signature"] = p.thought_signature
                parts.append(part_dict)
            if getattr(p, "function_response", None):
                fr = p.function_response
                parts.append({
                    "function_response": {
                        "name": getattr(fr, "name", None) or "",
                        "response": dict(getattr(fr, "response", None) or {}),
                    },
                })
    return {"role": getattr(content, "role", None) or "user", "parts": parts}


def dict_to_content(d: dict) -> types.Content:
    """Convert serialized dict back to Gemini Content."""
    role = d.get("role", "user")
    parts: list[types.Part] = []
    for p in d.get("parts", []):
        if "text" in p:
            parts.append(types.Part.from_text(text=p["text"]))
        elif "function_call" in p:
            fc = p["function_call"]
            part = types.Part.from_function_call(
                name=fc.get("name", ""),
                args=fc.get("args", {}),
            )
            # Restore thought_signature if it was preserved
            if "thought_signature" in fc:
                part.thought_signature = fc["thought_signature"]
            parts.append(part)
        elif "function_response" in p:
            fr = p["function_response"]
            parts.append(
                types.Part.from_function_response(
                    name=fr.get("name", ""),
                    response=fr.get("response", {}),
                ),
            )
    return types.Content(role=role, parts=parts)


def contents_from_state_messages(messages: list[dict]) -> list[types.Content]:
    """Convert state messages (list[dict]) to list[types.Content] for generate_with_tools."""
    return [dict_to_content(m) for m in messages]
