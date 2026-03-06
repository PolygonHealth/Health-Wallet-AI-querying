# src/llm/base_client.py
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum

from pydantic import BaseModel

CHARS_PER_TOKEN = 4
DEFAULT_MAX_CONTEXT_TOKENS = 1000000
DEFAULT_TOKEN_THRESHOLD = 0.85

class FinishReason(StrEnum):
    """Standard finish reasons every provider maps to."""
    STOP = "stop"
    MAX_TOKENS = "max_tokens"
    SAFETY = "safety"
    ERROR = "error"
    UNKNOWN = "unknown"
    REJECTED = "rejected"


@dataclass
class LLMUsage:
    input_tokens: int
    output_tokens: int


@dataclass
class LLMResponse:
    response: str | BaseModel
    model: str
    usage: LLMUsage
    finish_reason: FinishReason = FinishReason.UNKNOWN


class BaseLLMClient(ABC):
    def __init__(
        self,
        model_id: str,
        max_context_tokens: int = DEFAULT_MAX_CONTEXT_TOKENS,
        token_threshold: float = DEFAULT_TOKEN_THRESHOLD,
    ) -> None:
        self.model_id = model_id
        self.max_context_tokens = max_context_tokens
        self.token_threshold = token_threshold
        self.logger = logging.getLogger(type(self).__name__)

    def estimate_tokens(self, text: str) -> int:
        """Rough token estimate. 1 token ≈ 4 chars for English + JSON."""
        return len(text) // CHARS_PER_TOKEN

    def check_token_limit(self, prompt: str) -> LLMResponse | None:
        """
        Pre-flight token guardrail. Call before making the API request.
        Returns None if prompt fits → safe to proceed.
        Returns LLMResponse with REJECTED if prompt is too large → return immediately.
        """
        estimated_tokens = self.estimate_tokens(prompt)
        max_allowed = int(self.max_context_tokens * self.token_threshold)

        self.logger.info(
            "token_preflight | model=%s | estimated_tokens=%d | max_allowed=%d | threshold=%.0f%%",
            self.model_id,
            estimated_tokens,
            max_allowed,
            self.token_threshold * 100,
        )

        if estimated_tokens > max_allowed:
            self.logger.error(
                "token_limit_exceeded | model=%s | estimated_tokens=%d | max_allowed=%d | prompt_chars=%d",
                self.model_id,
                estimated_tokens,
                max_allowed,
                len(prompt),
            )
            return LLMResponse(
                response=f"Prompt too large: ~{estimated_tokens:,} tokens estimated, max {max_allowed:,} allowed ({self.token_threshold:.0%} of {self.max_context_tokens:,} context window).",
                model=self.model_id,
                usage=LLMUsage(input_tokens=estimated_tokens, output_tokens=0),
                finish_reason=FinishReason.REJECTED,
            )

        return None

    @abstractmethod
    async def complete(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        response_schema: type[BaseModel] | None = None,
    ) -> LLMResponse: ...