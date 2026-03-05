import logging
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models import QueryContext, QueryResult


@dataclass
class BenchmarkRow:
    query: str
    patient_id: str
    strategy: str
    model: str
    response: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: float = 0.0
    fhir_resources_loaded: int = 0
    documents_trimmed: bool = False
    expected_answer: str = ""
    error: str | None = None

    @classmethod
    def from_result(
        cls,
        query: str,
        patient_id: str,
        result: QueryResult,
        strategy: str,
        model: str,
        expected_answer: str = "",
    ) -> "BenchmarkRow":
        return cls(
            query=query,
            patient_id=patient_id,
            strategy=strategy,
            model=model,
            response=result.response_text,
            tokens_in=result.tokens_in,
            tokens_out=result.tokens_out,
            latency_ms=result.latency_ms,
            fhir_resources_loaded=getattr(result, "fhir_resources_loaded", 0),
            documents_trimmed=getattr(result, "documents_trimmed", False),
            expected_answer=expected_answer,
            error=result.error,
        )

    @classmethod
    def from_error(
        cls,
        query: str,
        patient_id: str,
        strategy: str,
        model: str,
        error: str,
        expected_answer: str = "",
    ) -> "BenchmarkRow":
        return cls(
            query=query,
            patient_id=patient_id,
            strategy=strategy,
            model=model,
            expected_answer=expected_answer,
            error=error,
        )


class BenchmarkRunner:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.logger = logging.getLogger(__name__)

    async def run(
        self,
        queries: list[dict],
        strategies: list[str],
        models: list[str],
    ) -> list[BenchmarkRow]:
        from src.core.strategy_registry import get_strategy_class
        from src.llm.client_factory import create_llm_client

        rows: list[BenchmarkRow] = []
        for q in queries:
            patient_id = q.get("patient_id", "")
            query_text = q.get("query", "")
            expected = q.get("expected_answer", "")
            for strat in strategies:
                for model_name in models:
                    self.logger.info(
                        "benchmark_run | query=%s | strategy=%s | model=%s",
                        query_text[:50],
                        strat,
                        model_name,
                    )
                    try:
                        strategy_cls = get_strategy_class(strat)
                        llm_client = create_llm_client(model_name)
                        strategy = strategy_cls(db=self.db, llm_client=llm_client)
                        context = QueryContext(
                            patient_id=patient_id,
                            query_text=query_text,
                            strategy_name=strat,
                            model_name=model_name,
                        )
                        result = await strategy.execute(context)
                        rows.append(
                            BenchmarkRow.from_result(
                                query=query_text,
                                patient_id=patient_id,
                                result=result,
                                strategy=strat,
                                model=model_name,
                                expected_answer=expected,
                            )
                        )
                    except Exception as e:
                        self.logger.error(
                            "benchmark_failed | strategy=%s | model=%s | error=%s",
                            strat,
                            model_name,
                            str(e),
                        )
                        rows.append(
                            BenchmarkRow.from_error(
                                query=query_text,
                                patient_id=patient_id,
                                strategy=strat,
                                model=model_name,
                                error=str(e),
                                expected_answer=expected,
                            )
                        )
        return rows
