import json
import time

from pydantic import BaseModel, Field

from src.core.base_strategy import BaseStrategy
from src.core.models import QueryContext, QueryResult
from src.core.strategy_registry import register_strategy
from src.db.queries import get_all_fhir_by_patient
from src.llm.base_client import FinishReason


class NaiveDumpLLMResponse(BaseModel):
    """Schema the LLM must return. Gemini enforces this via response_schema."""

    answer: str
    resource_ids: list[str] = Field(
        default_factory=list,
        description="List of resource IDs used to answer the question.",
    )


@register_strategy("naive_dump")
class NaiveDumpStrategy(BaseStrategy):
    """Load all FHIR resources, dump as JSON into prompt, call LLM with structured output."""

    @property
    def name(self) -> str:
        return "naive_dump"

    async def execute(self, context: QueryContext) -> QueryResult:
        try:
            resources = await get_all_fhir_by_patient(self.db, context.patient_id)
            prompt = self._build_prompt(context.query_text, resources)

            self.logger.info(
                "llm_call_start | model=%s | token_estimate=%d",
                self.llm_client.model_id,
                len(prompt) // 4,
            )

            t0 = time.perf_counter()
            response = await self.llm_client.complete(
                prompt=prompt,
                max_tokens=context.max_tokens,
                temperature=context.temperature,
                response_schema=NaiveDumpLLMResponse,
            )
            latency_ms = (time.perf_counter() - t0) * 1000

            if response.finish_reason == FinishReason.REJECTED:
                return QueryResult(
                    response_text="",
                    resource_ids=[],
                    model_used=response.model,
                    strategy_used=self.name,
                    tokens_in=response.usage.input_tokens,
                    tokens_out=0,
                    latency_ms=latency_ms,
                    error=response.response,
                )

            self.logger.info(
                "llm_call_complete | model=%s | tokens_in=%d | latency_ms=%.0f",
                response.model,
                response.usage.input_tokens,
                latency_ms,
            )

            if response.finish_reason.value == "max_tokens":
                self.logger.warning("llm_truncated | patient_id=%s", context.patient_id)

            # Parse structured JSON into Pydantic model
            parsed = NaiveDumpLLMResponse.model_validate_json(response.response)

            return QueryResult(
                response_text=parsed.answer,
                resource_ids=parsed.resource_ids,
                model_used=response.model,
                strategy_used=self.name,
                tokens_in=response.usage.input_tokens,
                tokens_out=response.usage.output_tokens,
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

    def _build_prompt(self, query: str, resources: list[dict]) -> str:
        numbered_resources = ""
        for i, r in enumerate(resources, start=1):
            numbered_resources += f"\n--- Resource [{i}] ({r['resource_type']}) ---\n"
            numbered_resources += json.dumps(r["resource"], indent=2, default=str)
            numbered_resources += "\n"

        return f"""
        You are a clinical assistant. Answer the patient's question using ONLY the FHIR health data below.

        RULES:
        - Be concise and use plain English a patient can understand.
        - Every factual claim must reference the resource number it came from.
        - Use resource_indices to indicate which resource(s) support each claim.
        - If the records don't contain enough information, put your explanation in the unanswered field.

        FHIR RECORDS:
        {numbered_resources}

        PATIENT QUESTION: {query}
        """
