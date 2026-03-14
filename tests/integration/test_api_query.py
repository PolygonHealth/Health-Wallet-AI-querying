"""Integration tests for POST /api/fhir/query."""

import pytest


@pytest.mark.asyncio
async def test_valid_request_returns_200_with_response(async_client_seeded):
    resp = await async_client_seeded.post(
        "/api/fhir/query",
        json={
            "patient_id": "patient-1",
            "query": "What conditions do I have?",
            "model": "langgraph-mock",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "response" in data
    assert "resource_ids" in data
    assert data["model_used"] == "langgraph-mock"
    assert data["strategy_used"] == "langgraph"


@pytest.mark.asyncio
async def test_missing_patient_id_returns_422(async_client_seeded):
    resp = await async_client_seeded.post(
        "/api/fhir/query",
        json={"query": "test"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_unknown_strategy_returns_400(async_client_seeded):
    resp = await async_client_seeded.post(
        "/api/fhir/query",
        json={
            "patient_id": "patient-1",
            "query": "test",
            "strategy": "unknown_strategy",
            "model": "mock",
        },
    )
    assert resp.status_code == 400
    assert "Unknown strategy" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_unknown_model_returns_400(async_client_seeded):
    resp = await async_client_seeded.post(
        "/api/fhir/query",
        json={
            "patient_id": "patient-1",
            "query": "test",
            "model": "unknown-model",
        },
    )
    assert resp.status_code == 400
    assert "Unknown model prefix" in resp.json()["detail"]
