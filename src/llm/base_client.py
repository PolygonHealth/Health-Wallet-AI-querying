import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum
from pydantic import BaseModel


class FinishReason(StrEnum):
    """Standard finish reasons every provider maps to."""

    STOP = "stop"  # Model finished naturally
    MAX_TOKENS = "max_tokens"  # Hit limit, response truncated
    SAFETY = "safety"  # Content filter blocked
    ERROR = "error"  # Generation failed
    UNKNOWN = "unknown"  # Provider returned unexpected value


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
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id
        self.logger = logging.getLogger(type(self).__name__)

    @abstractmethod
    async def complete(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        response_schema: type[BaseModel] | None = None,
    ) -> LLMResponse:
        ...
