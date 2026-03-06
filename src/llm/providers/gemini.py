from dataclasses import dataclass

from google import genai
from google.genai import types
from pydantic import BaseModel

from src.config.settings import settings
from src.llm.base_client import FinishReason, LLMResponse, LLMUsage, BaseLLMClient


@dataclass
class ToolCallResponse:
    """Response from generate_with_tools: text, function_calls, usage."""

    text: str
    function_calls: list[dict]  # [{"id": str, "name": str, "args": dict}, ...]
    usage: LLMUsage
    finish_reason: FinishReason
    raw_model_content: types.Content | None = None # # preserve original response (thought_signature etc.)


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
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

    async def complete(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        response_schema: type[BaseModel] | None = None,
    ) -> LLMResponse:

        # Guardrail: Check token limit before calling the API
        rejected = self.check_token_limit(prompt)
        if rejected:
            return rejected

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
            if candidate
            and hasattr(candidate, "finish_reason")
            and candidate.finish_reason
            else "unknown"
        )
        finish_reason = _GEMINI_FINISH_REASON_MAP.get(raw_reason, FinishReason.UNKNOWN)

        return LLMResponse(
            response=text,
            model=self.model_id,
            usage=LLMUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            ),
            finish_reason=finish_reason,
        )

    async def generate_with_tools(
        self,
        contents: list[types.Content],
        tools: list[types.Tool],
        max_tokens: int,
        temperature: float,
        *,
        use_tools: bool = True,
    ) -> ToolCallResponse:
        """
        Generate content with optional tool calling.
        use_tools=False removes tools from config to force text-only response.
        """
        aclient = self._client.aio
        config = types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        if use_tools and tools:
            config.tools = tools
            config.tool_config = types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(
                    mode=types.FunctionCallingConfigMode.AUTO,
                    allowed_function_names=None,
                )
            )

        response = await aclient.models.generate_content(
            model=self.model_id,
            contents=contents,
            config=config,
        )

        usage = response.usage_metadata
        input_tokens = getattr(usage, "prompt_token_count", 0) or 0
        output_tokens = getattr(usage, "candidates_token_count", 0) or 0
        usage_obj = LLMUsage(input_tokens=input_tokens, output_tokens=output_tokens)

        candidate = response.candidates[0] if response.candidates else None
        raw_reason = (
            candidate.finish_reason.name.lower()
            if candidate and hasattr(candidate, "finish_reason") and candidate.finish_reason
            else "unknown"
        )
        finish_reason = _GEMINI_FINISH_REASON_MAP.get(raw_reason, FinishReason.UNKNOWN)

        text_parts: list[str] = []
        function_calls: list[dict] = []

        if candidate and hasattr(candidate, "content") and candidate.content and candidate.content.parts:
            for part in candidate.content.parts:
                if part.text:
                    text_parts.append(part.text)
                if part.function_call:
                    fc = part.function_call
                    function_calls.append({
                        "name": fc.name or "",
                        "args": fc.args or {},
                    })

        return ToolCallResponse(
            text="".join(text_parts),
            function_calls=function_calls,
            usage=usage_obj,
            finish_reason=finish_reason,
            raw_model_content=candidate.content if candidate else None
        )
