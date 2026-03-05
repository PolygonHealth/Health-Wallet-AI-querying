"""Integration tests for db/queries using testcontainers PostgreSQL."""

import pytest

from src.db.queries import get_all_fhir_by_patient, get_fhir_by_type


@pytest.mark.asyncio
async def test_get_all_fhir_by_patient_returns_correct_rows(seeded_db):
    rows = await get_all_fhir_by_patient(seeded_db, "patient-1")
    assert len(rows) >= 2
    for r in rows:
        assert "id" in r
        assert "resource_type" in r
        assert "resource" in r
        assert "received_at" in r


@pytest.mark.asyncio
async def test_get_fhir_by_type_filters_correctly(seeded_db):
    rows = await get_fhir_by_type(seeded_db, "patient-1", "Condition")
    assert len(rows) >= 1
    assert all(r["resource_type"] == "Condition" for r in rows)


@pytest.mark.asyncio
async def test_empty_patient_returns_empty_list(db_session):
    rows = await get_all_fhir_by_patient(db_session, "nonexistent-patient")
    assert rows == []
