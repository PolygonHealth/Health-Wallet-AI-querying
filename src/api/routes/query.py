from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import src.core  # noqa: F401 - triggers strategy registration
from src.api.dependencies import get_session_factory, resolve_strategy
from src.config.settings import settings
from src.core.base_strategy import BaseStrategy
from src.core.models import QueryContext

router = APIRouter()


class QueryRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    query: str = Field(..., min_length=1)
    strategy: str | None = None
    model: str | None = None


class QueryResponse(BaseModel):
    response: str
    resource_ids: list[str]
    model_used: str
    strategy_used: str
    tokens_in: int
    tokens_out: int
    latency_ms: float
    resource_types: list[str]
    error: str | None = None

    @classmethod
    def from_result(cls, result) -> "QueryResponse":
        return cls(
            response=result.response_text,
            resource_ids=result.resource_ids,
            model_used=result.model_used,
            strategy_used=result.strategy_used,
            tokens_in=result.tokens_in,
            tokens_out=result.tokens_out,
            latency_ms=result.latency_ms,
            resource_types=getattr(result, "resource_types", []) or [],
            error=result.error,
        )


@router.post("/query", response_model=QueryResponse)
async def run_query(
    req: QueryRequest,
    session_factory=Depends(get_session_factory),
):
    strategy_name = req.strategy or settings.DEFAULT_STRATEGY
    model_name = req.model or settings.DEFAULT_MODEL

    try:
        strategy: BaseStrategy = resolve_strategy(strategy_name, session_factory, model_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    context = QueryContext(
        patient_id=req.patient_id,
        query_text=req.query,
        strategy_name=strategy_name,
        model_name=model_name,
    )
    result = await strategy.execute(context)
    return QueryResponse.from_result(result)
