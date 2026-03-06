"""Unit tests for ToolExecutor."""

from unittest.mock import AsyncMock, patch

import pytest

from src.core.strategies.agentic.tool_executor import ToolExecutor


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def executor(mock_db):
    return ToolExecutor(db=mock_db, patient_id="patient-1")


@pytest.mark.asyncio
async def test_get_patient_overview(executor, mock_db):
    mock_data = {"by_type": [{"resource_type": "Condition", "count": 5}], "total_resources": 5}
    with patch(
        "src.core.strategies.agentic.tool_executor.get_patient_overview",
        new_callable=AsyncMock,
        return_value=mock_data,
    ):
        result, ids = await executor.execute("get_patient_overview", {})
    assert "by_type" in result
    assert ids == []


@pytest.mark.asyncio
async def test_get_resources_by_type(executor, mock_db):
    rows = [
        {"id": "r1", "resource_type": "Condition", "resource": {}, "received_at": ""},
    ]
    with patch(
        "src.core.strategies.agentic.tool_executor.get_fhir_by_type",
        new_callable=AsyncMock,
        return_value=rows,
    ):
        result, ids = await executor.execute("get_resources_by_type", {"resource_type": "Condition"})
    assert "r1" in ids
    assert "resources" in result


@pytest.mark.asyncio
async def test_execute_sql_validation_error(executor):
    from src.core.strategies.agentic.sql_guard import SQLValidationError

    with patch(
        "src.core.strategies.agentic.tool_executor.validate_sql",
        side_effect=SQLValidationError("SQL must use :pid"),
    ):
        result, ids = await executor.execute("execute_sql", {"sql": "SELECT * FROM x"})
    assert "error" in result
    assert ids == []


@pytest.mark.asyncio
async def test_unknown_tool_returns_error(executor):
    result, ids = await executor.execute("unknown_tool", {})
    assert "error" in result
    assert "Unknown tool" in result
    assert ids == []


@pytest.mark.asyncio
async def test_finish_with_answer(executor):
    result, ids = await executor.execute("finish_with_answer", {"answer": "The patient has hypertension."})
    assert "acknowledged" in result
    assert ids == []
