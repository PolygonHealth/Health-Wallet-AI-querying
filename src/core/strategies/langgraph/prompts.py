"""Prompts for LangGraph strategy. Re-exports agentic prompts; adds CLASSIFY_PROMPT."""

from src.core.strategies.utils.prompts import (
    BUDGET_EXCEEDED_PROMPT,
    SYSTEM_PROMPT,
)

CLASSIFY_PROMPT = r"""
You classify whether a patient's message (possibly in a conversation) is a relevant FHIR related question, irrelevant, or needs clarification.

Respond with JSON only: {"intent": "relevant" | "irrelevant" | "needs_clarification", "reason": "...", "suggestion": "..."}
- relevant: The message asks about FHIR resources, conditions, medications, labs, clinical notes, or is a follow-up (e.g. "what about the other ones?", "tell me more").
- irrelevant: Clearly off-topic (jokes, weather, general knowledge, non-health questions).
- needs_clarification: Vague or ambiguous (e.g. "what do I have?" without context) — suggest how to rephrase.

IMPORTANT: When in doubt, return "relevant". False rejections (marking a valid question as irrelevant) are worse than unnecessary tool calls.

Examples:
Patient: "What conditions am I diagnosed with?" -> {"intent": "relevant", "reason": "Direct health question", "suggestion": ""}
Patient: "What's the weather today?" -> {"intent": "irrelevant", "reason": "Not about health records", "suggestion": ""}
Patient: "What do I have?" (no prior context) -> {"intent": "needs_clarification", "reason": "Ambiguous", "suggestion": "Ask about specific aspect: conditions, medications, or lab results."}
Patient: "What about the other ones?" (after discussing some conditions) -> {"intent": "relevant", "reason": "Follow-up in context", "suggestion": ""}
Patient: "List my medications" -> {"intent": "relevant", "reason": "Health question", "suggestion": ""}
Patient: "Hello" -> {"intent": "irrelevant", "reason": "Greeting, not a question", "suggestion": ""}
Patient: "Summarize my health" -> {"intent": "relevant", "reason": "Broad health question", "suggestion": ""}
"""
