import logging
from google import genai
from google.genai import types
from pydantic import BaseModel

from src.config.settings import settings
from src.llm.base_client import FinishReason, LLMResponse, LLMUsage, BaseLLMClient

# Gemini returns: STOP, MAX_TOKENS, SAFETY, RECITATION, OTHER
# Map to standard FinishReason
_GEMINI_FINISH_REASON_MAP: dict[str, FinishReason] = {
    "stop": FinishReason.STOP,
    "max_tokens": FinishReason.MAX_TOKENS,
    "safety": FinishReason.SAFETY,
    "recitation": FinishReason.SAFETY,
    "other": FinishReason.UNKNOWN,
}


class GeminiClient(BaseLLMClient):
    """Google Gemini client using google-genai SDK."""

    def __init__(self, model_id: str) -> None:
        super().__init__(model_id=model_id)
        self._client = genai.Client(api_key=settings.GOOGLE_API_KEY)

    async def complete(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        response_schema: type[BaseModel] | None = None,
    ) -> LLMResponse:
        self.logger.info(
            "llm_request | model=%s | prompt_len=%d",
            self.model_id,
            len(prompt),
        )
        try:
            result = await self._call_gemini(
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                response_schema=response_schema,
            )
            self.logger.info(
                "llm_response | model=%s | tokens_out=%d",
                self.model_id,
                result.usage.output_tokens,
            )
            return result
        except Exception as e:
            self.logger.error(
                "llm_error | model=%s | error=%s",
                self.model_id,
                str(e),
            )
            raise

    async def _call_gemini(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        response_schema: type[BaseModel] | None = None,
    ) -> LLMResponse:
        aclient = self._client.aio
        config = types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        if response_schema:
            config.response_mime_type = "application/json"
            config.response_schema = response_schema
        
        response = await aclient.models.generate_content(
            model=self.model_id,
            contents=prompt,
            config=config,
        )
        usage = response.usage_metadata
        input_tokens = getattr(usage, "prompt_token_count", 0) or 0
        output_tokens = getattr(usage, "candidates_token_count", 0) or 0
        text = response.text or ""

        candidate = response.candidates[0] if response.candidates else None
        raw_reason = (
            candidate.finish_reason.name.lower()
            if candidate and hasattr(candidate, "finish_reason") and candidate.finish_reason
            else "unknown"
        )
        finish_reason = _GEMINI_FINISH_REASON_MAP.get(
            raw_reason, FinishReason.UNKNOWN
        )

        return LLMResponse(
            response=text,
            model=self.model_id,
            usage=LLMUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            ),
            finish_reason=finish_reason,
        )
