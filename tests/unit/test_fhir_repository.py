"""Unit tests for FhirRepository."""

from unittest.mock import AsyncMock, patch

import pytest

from src.core.strategies.langgraph.repository import FhirRepository


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def repo(mock_db):
    return FhirRepository(db=mock_db, patient_id="patient-1")


@pytest.mark.asyncio
async def test_get_patient_overview(repo, mock_db):
    mock_data = {"by_type": [{"resource_type": "Condition", "count": 5}], "total_resources": 5}
    with patch(
        "src.core.strategies.langgraph.repository.get_patient_overview",
        new_callable=AsyncMock,
        return_value=mock_data,
    ):
        result, types = await repo.get_patient_overview()
    assert "by_type" in result
    assert types == ["Condition"]


@pytest.mark.asyncio
async def test_get_resources_by_type(repo, mock_db):
    rows = [{"resource_id": "r1", "resource_type": "Condition", "resource": {}, "received_at": ""}]
    with patch(
        "src.core.strategies.langgraph.repository.get_fhir_by_type",
        new_callable=AsyncMock,
        return_value=rows,
    ):
        result, ids, types = await repo.get_resources_by_type("Condition")
    assert ids == ["r1"]
    assert "resources" in result
    assert types == ["Condition"]


@pytest.mark.asyncio
async def test_get_final_answer_returns_json_dict_shape(repo):
    out = repo.get_final_answer("The answer.", ["id1", "id2"])
    import json
    data = json.loads(out)
    assert data["answer"] == "The answer."
    assert data["resource_ids"] == ["id1", "id2"]
    assert "resource_types" in data
