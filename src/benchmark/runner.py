# runner.py
import asyncio
import logging
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.models import QueryContext, QueryResult

# Module-level progress store
_progress: dict[str, dict] = {}


def get_progress(job_id: str) -> dict:
    return _progress.get(job_id, {})


def clear_progress(job_id: str) -> None:
    _progress.pop(job_id, None)


def _parse_expected_resource_types(value: str | list[str] | None) -> list[str]:
    """Parse expected resource types from CSV string (comma-separated) or list."""
    if not value:
        return []
    if isinstance(value, list):
        return [str(x).strip() for x in value if x]
    return [x.strip() for x in str(value).split(",") if x.strip()]


def _resource_types_match(expected: list[str], actual: list[str]) -> bool:
    """True if all expected types are present in actual (expected ⊆ actual)."""
    if not expected:
        return True
    exp = {t.strip() for t in expected if t}
    act = {t.strip() for t in actual if t}
    return exp.issubset(act)


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
    resource_types: list[str] = field(default_factory=list)
    expected_resource_types: list[str] = field(default_factory=list)
    error: str | None = None

    @classmethod
    def from_result(
        cls,
        query: str,
        patient_id: str,
        result: QueryResult,
        strategy: str,
        model: str,
        expected_resource_types: str | list[str] = "",
    ) -> "BenchmarkRow":
        actual = getattr(result, "resource_types", []) or []
        expected = _parse_expected_resource_types(expected_resource_types)
        return cls(
            query=query,
            patient_id=patient_id,
            strategy=strategy,
            model=model,
            response=result.response_text,
            tokens_in=result.tokens_in,
            tokens_out=result.tokens_out,
            latency_ms=result.latency_ms,
            resource_types=actual,
            expected_resource_types=expected,
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
        expected_resource_types: str | list[str] = "",
    ) -> "BenchmarkRow":
        expected = _parse_expected_resource_types(expected_resource_types)
        return cls(
            query=query,
            patient_id=patient_id,
            strategy=strategy,
            model=model,
            expected_resource_types=expected,
            error=error,
        )


class BenchmarkRunner:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession], concurrency: int = 5) -> None:
        self.session_factory = session_factory
        self.concurrency = concurrency
        self.logger = logging.getLogger(__name__)

    async def _run_single(
        self,
        semaphore: asyncio.Semaphore,
        index: int,
        query_text: str,
        patient_id: str,
        strategy_name: str,
        model_name: str,
        expected_resource_types: str | list[str],
        job_id: str,
    ) -> BenchmarkRow:
        async with semaphore:
            _progress[job_id]["current_query"] = query_text[:80]
            _progress[job_id]["current_index"] = index

            self.logger.info(
                "benchmark_start | query=%s | strategy=%s | model=%s",
                query_text[:50],
                strategy_name,
                model_name,
            )
            try:
                from src.core.strategy_registry import get_strategy_class
                from src.llm.provider import create_llm

                strategy_cls = get_strategy_class(strategy_name)
                llm = create_llm(model_name)
                strategy = strategy_cls(session_factory=self.session_factory, llm=llm)

                context = QueryContext(
                    patient_id=patient_id,
                    query_text=query_text,
                    strategy_name=strategy_name,
                    model_name=model_name,
                )
                result = await strategy.execute(context)
                row = BenchmarkRow.from_result(
                    query=query_text,
                    patient_id=patient_id,
                    result=result,
                    strategy=strategy_name,
                    model=model_name,
                    expected_resource_types=expected_resource_types,
                )
            except Exception as e:
                self.logger.error(
                    "benchmark_failed | strategy=%s | model=%s | error=%s",
                    strategy_name,
                    model_name,
                    str(e),
                )
                row = BenchmarkRow.from_error(
                    query=query_text,
                    patient_id=patient_id,
                    strategy=strategy_name,
                    model=model_name,
                    error=str(e),
                    expected_resource_types=expected_resource_types,
                )

            # Update progress
            _progress[job_id]["completed"] += 1
            status = "error" if row.error else "ok"
            _progress[job_id]["results"].append(
                {
                    "index": index,
                    "query": query_text[:80],
                    "status": status,
                    "latency_ms": round(row.latency_ms),
                    "error": (row.error or "")[:100],
                }
            )
            return row

    async def run(
        self,
        queries: list[dict],
        strategies: list[str],
        models: list[str],
        job_id: str = "default",
    ) -> list[BenchmarkRow]:
        # Build task list
        tasks_info = []
        for q in queries:
            for strat in strategies:
                for model_name in models:
                    tasks_info.append((q, strat, model_name))

        total = len(tasks_info)
        _progress[job_id] = {
            "total": total,
            "completed": 0,
            "current_index": 0,
            "current_query": "",
            "results": [],
        }

        semaphore = asyncio.Semaphore(self.concurrency)
        tasks = []
        for i, (q, strat, model_name) in enumerate(tasks_info, start=1):
            tasks.append(
                self._run_single(
                    semaphore,
                    index=i,
                    query_text=q.get("query", ""),
                    patient_id=q.get("patient_id", ""),
                    strategy_name=strat,
                    model_name=model_name,
                    expected_resource_types=q.get("expected_resource_types", ""),
                    job_id=job_id,
                )
            )

        rows = await asyncio.gather(*tasks)
        _progress[job_id]["completed"] = total
        return list(rows)