import pytest


@pytest.mark.asyncio
async def test_returns_200_when_db_up(async_client):
    resp = await async_client.get("/api/fhir/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
