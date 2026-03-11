"""Unit tests for NaiveDumpStrategy with mocked DB and LLM."""

from unittest.mock import AsyncMock, patch

import pytest

from src.core.models import QueryContext, QueryResult
from src.core.strategies.naive_dump.strategy import NaiveDumpStrategy
from tests.mocks.mock_llm_client import MockLLMClient

# Patch where get_all_fhir_by_patient is used (in strategy module)
PATCH_GET_FHIR = "src.core.strategies.naive_dump.strategy.get_all_fhir_by_patient"


class _DummySessionCtx:
    """Async context manager that returns a provided db object."""

    def __init__(self, db):
        self._db = db

    async def __aenter__(self):
        return self._db

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.fixture
def mock_db():
    db = AsyncMock()
    return db


@pytest.fixture
def mock_session_factory(mock_db):
    """Mimic async_sessionmaker: callable returning an async context manager."""

    def _factory():
        return _DummySessionCtx(mock_db)

    return _factory


@pytest.fixture
def mock_llm():
    return MockLLMClient(
        model_id="mock",
        response_text='{"answer": "Based on your records, you have hypertension.", "resource_ids": ["res-1"]}',
        input_tokens=20,
        output_tokens=10,
    )


@pytest.fixture
def strategy(mock_session_factory, mock_llm):
    return NaiveDumpStrategy(session_factory=mock_session_factory, llm_client=mock_llm)


@pytest.mark.asyncio
async def test_builds_prompt_and_returns_llm_answer(strategy):
    async def mock_get_all(db, pid):
        return [
            {
                "id": "res-1",
                "resource_type": "Condition",
                "resource": {"code": {"text": "Hypertension"}},
            },
        ]

    with patch(PATCH_GET_FHIR, side_effect=mock_get_all):
        ctx = QueryContext(
            patient_id="patient-1",
            query_text="What conditions do I have?",
            strategy_name="naive_dump",
            model_name="mock",
        )
        result = await strategy.execute(ctx)

    assert "hypertension" in result.response_text.lower()


@pytest.mark.asyncio
async def test_returns_query_result_with_correct_resource_ids(strategy):
    async def mock_get_all(db, pid):
        return [
            {"id": "r1", "resource_type": "Condition", "resource": {}},
            {"id": "r2", "resource_type": "Observation", "resource": {}},
        ]

    with patch(PATCH_GET_FHIR, side_effect=mock_get_all):
        ctx = QueryContext(
            patient_id="p1",
            query_text="q",
            strategy_name="naive_dump",
            model_name="mock",
        )
        result = await strategy.execute(ctx)

    assert isinstance(result, QueryResult)
    assert result.resource_ids == ["res-1"]  # from mock LLM response
    assert result.model_used == "mock"
    assert result.strategy_used == "naive_dump"


@pytest.mark.asyncio
async def test_handles_empty_resources_gracefully(strategy):
    async def mock_get_empty(db, pid):
        return []

    with patch(PATCH_GET_FHIR, side_effect=mock_get_empty):
        ctx = QueryContext(
            patient_id="p1",
            query_text="q",
            strategy_name="naive_dump",
            model_name="mock",
        )
        result = await strategy.execute(ctx)

    assert result.response_text  # mock returns answer
    assert result.error is None


@pytest.mark.asyncio
async def test_catches_llm_errors_and_returns_query_result_with_error(strategy):
    async def mock_get_all(db, pid):
        return [{"id": "r1", "resource_type": "C", "resource": {}}]

    failing_llm = MockLLMClient(
        model_id="mock",
        response_text="not valid json",  # will fail model_validate_json
    )
    strategy_bad = NaiveDumpStrategy(
        session_factory=strategy.session_factory,
        llm_client=failing_llm,
    )

    with patch(PATCH_GET_FHIR, side_effect=mock_get_all):
        ctx = QueryContext(
            patient_id="p1",
            query_text="q",
            strategy_name="naive_dump",
            model_name="mock",
        )
        result = await strategy_bad.execute(ctx)

    assert result.response_text == ""
    assert result.resource_ids == []
    assert result.error is not None
