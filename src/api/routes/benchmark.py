import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.api.dependencies import get_session_factory
from src.benchmark.runner import BenchmarkRunner, get_progress, clear_progress
from src.benchmark.excel_writer import write_benchmark_excel

router = APIRouter()


class BenchmarkQueryItem(BaseModel):
    patient_id: str = Field(..., min_length=1)
    query: str = Field(..., min_length=1)
    expected_resource_types: str = ""


class BenchmarkRequest(BaseModel):
    queries: list[BenchmarkQueryItem]
    strategies: list[str] = Field(default_factory=lambda: ["langgraph"])
    models: list[str] = Field(default_factory=lambda: ["gemini-3.0-flash"])
    concurrency: int = Field(default=5, ge=1, le=50)
    job_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])


@router.post("/benchmark")
async def run_benchmark(req: BenchmarkRequest, session_factory=Depends(get_session_factory)):
    query_dicts = [
        {
            "patient_id": q.patient_id,
            "query": q.query,
            "expected_resource_types": q.expected_resource_types,
        }
        for q in req.queries
    ]
    runner = BenchmarkRunner(session_factory=session_factory, concurrency=req.concurrency)
    results = await runner.run(query_dicts, req.strategies, req.models, job_id=req.job_id)
    buffer = write_benchmark_excel(results)
    clear_progress(req.job_id)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=benchmark.xlsx"},
    )


@router.get("/benchmark/progress/{job_id}")
async def benchmark_progress(job_id: str):
    return get_progress(job_id)