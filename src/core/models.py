from dataclasses import dataclass


@dataclass(frozen=True)
class QueryContext:
    patient_id: str
    query_text: str
    strategy_name: str
    model_name: str
    max_tokens: int = 4096
    temperature: float = 0.1


@dataclass
class QueryResult:
    response_text: str
    resource_ids: list[str]
    model_used: str = ""
    strategy_used: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: float = 0.0
    error: str | None = None
