"""Unit tests for SQL guard validation."""

import pytest

from src.core.strategies.utils.sql_guard import SQLValidationError, validate_sql


def test_valid_select_with_pid():
    sql = "SELECT id, resource_type FROM fhir_resources WHERE patient_id = :pid LIMIT 10"
    result = validate_sql(sql)
    assert "LIMIT" in result
    assert ":pid" in result


def test_adds_limit_when_missing():
    sql = "SELECT * FROM fhir_resources WHERE patient_id = :pid"
    result = validate_sql(sql)
    assert "LIMIT 50" in result


def test_caps_limit_when_too_high():
    sql = "SELECT * FROM fhir_resources WHERE patient_id = :pid LIMIT 1000"
    result = validate_sql(sql)
    assert "LIMIT 50" in result


def test_rejects_without_pid():
    with pytest.raises(SQLValidationError) as exc_info:
        validate_sql("SELECT * FROM fhir_resources LIMIT 10")
    assert ":pid" in str(exc_info.value).lower() or "pid" in str(exc_info.value).lower()


def test_rejects_delete():
    with pytest.raises(SQLValidationError):
        validate_sql("DELETE FROM fhir_resources WHERE patient_id = :pid")


def test_rejects_drop():
    with pytest.raises(SQLValidationError):
        validate_sql("DROP TABLE fhir_resources")


def test_rejects_insert():
    with pytest.raises(SQLValidationError):
        validate_sql("INSERT INTO fhir_resources (patient_id) VALUES (:pid)")


def test_rejects_update():
    with pytest.raises(SQLValidationError):
        validate_sql("UPDATE fhir_resources SET resource = '{}' WHERE patient_id = :pid")


def test_rejects_forbidden_case_insensitive():
    with pytest.raises(SQLValidationError):
        validate_sql("DELETE FROM fhir_resources WHERE patient_id = :pid")
    with pytest.raises(SQLValidationError):
        validate_sql("DeLeTe FROM fhir_resources WHERE patient_id = :pid")


def test_rejects_disallowed_table():
    with pytest.raises(SQLValidationError) as exc_info:
        validate_sql("SELECT * FROM users WHERE patient_id = :pid LIMIT 10")
    assert "not allowed" in str(exc_info.value).lower() or "users" in str(exc_info.value).lower()


def test_rejects_empty_sql():
    with pytest.raises(SQLValidationError):
        validate_sql("")
    with pytest.raises(SQLValidationError):
        validate_sql("   ")
