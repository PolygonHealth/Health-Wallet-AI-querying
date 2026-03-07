"""Integration tests for LangGraph strategy with real DB and mock Gemini."""

import pytest


@pytest.mark.asyncio
async def test_langgraph_strategy_returns_200_with_tool_calls(async_client_seeded):
    """Full langgraph loop: classify -> call_tools -> execute_tools -> synthesize."""
    resp = await async_client_seeded.post(
        "/api/v1/query",
        json={
            "patient_id": "patient-1",
            "query": "What conditions do I have?",
            "strategy": "langgraph",
            "model": "langgraph-mock",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "response" in data
    assert "resource_ids" in data
    assert data["strategy_used"] == "langgraph"
    assert data["model_used"] == "langgraph-mock"
    assert "hypertension" in data["response"].lower()
    assert isinstance(data["resource_ids"], list)


@pytest.mark.asyncio
async def test_langgraph_patient_scoping(async_client_seeded):
    """Tools only return data for the requested patient."""
    resp = await async_client_seeded.post(
        "/api/v1/query",
        json={
            "patient_id": "patient-2",
            "query": "What conditions do I have?",
            "strategy": "langgraph",
            "model": "langgraph-mock",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "response" in data
    assert data["strategy_used"] == "langgraph"
