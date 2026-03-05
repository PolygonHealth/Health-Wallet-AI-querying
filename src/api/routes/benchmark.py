from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.api.dependencies import get_db
from src.benchmark.runner import BenchmarkRunner
from src.benchmark.excel_writer import write_benchmark_excel

router = APIRouter()


class BenchmarkQueryItem(BaseModel):
    patient_id: str = Field(..., min_length=1)
    query: str = Field(..., min_length=1)
    expected_answer: str = ""


class BenchmarkRequest(BaseModel):
    queries: list[BenchmarkQueryItem]
    strategies: list[str] = Field(default_factory=lambda: ["naive_dump"])
    models: list[str] = Field(default_factory=lambda: ["gemini-3.0-flash"])


@router.post("/benchmark")
async def run_benchmark(req: BenchmarkRequest, db=Depends(get_db)):
    query_dicts = [
        {
            "patient_id": q.patient_id,
            "query": q.query,
            "expected_answer": q.expected_answer,
        }
        for q in req.queries
    ]
    runner = BenchmarkRunner(db=db)
    results = await runner.run(query_dicts, req.strategies, req.models)
    buffer = write_benchmark_excel(results)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=benchmark.xlsx"},
    )
