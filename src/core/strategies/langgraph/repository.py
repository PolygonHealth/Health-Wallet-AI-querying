"""FhirRepository — typed data-access layer for FHIR queries.

Replaces ToolExecutor's string-keyed _dispatch() with real method calls.
Tools import this and call typed methods directly; no string routing.
"""

import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.strategies.utils.constants import (
    DEFAULT_KEYWORD_LIMIT,
    DEFAULT_RESOURCE_LIMIT,
    MAX_SINGLE_RESULT_CHARS,
)
from src.core.strategies.utils.sql_guard import SQLValidationError, validate_sql
from src.db.queries import (
    execute_raw_sql,
    get_fhir_by_type,
    get_fhir_resources_schema_info,
    get_patient_overview,
    search_resources_by_keyword,
)

logger = logging.getLogger(__name__)

_TRUNCATION_MESSAGE = (
    "Result truncated. Use more specific filters to reduce result size."
)


def _truncate(data: dict | list, tool_name: str) -> str:
    """Serialize and truncate if over MAX_SINGLE_RESULT_CHARS."""
    json_str = json.dumps(data, default=str)
    if len(json_str) <= MAX_SINGLE_RESULT_CHARS:
        return json_str
    logger.warning(
        "tool_result_truncated | tool=%s | size=%d | cap=%d",
        tool_name,
        len(json_str),
        MAX_SINGLE_RESULT_CHARS,
    )
    return json.dumps(
        {
            "truncated": True,
            "message": _TRUNCATION_MESSAGE,
            "chars_returned": MAX_SINGLE_RESULT_CHARS,
            "total_chars": len(json_str),
        },
        default=str,
    )


class FhirRepository:
    """Typed FHIR data-access methods. One instance per tool invocation (holds db + patient_id)."""

    def __init__(self, db: AsyncSession, patient_id: str) -> None:
        self.db = db
        self.patient_id = patient_id

    async def patient_overview(self) -> tuple[str, list[str]]:
        """Returns (json_result, resource_types)."""
        try:
            data = await get_patient_overview(self.db, self.patient_id)
            types = [row["resource_type"] for row in data.get("by_type", [])]
            return _truncate(data, "overview"), types
        except Exception as e:
            logger.error("repo_error | method=patient_overview | error=%s", e)
            return json.dumps({"error": str(e)}), []

    async def resources_by_type(
        self,
        resource_type: str,
        limit: int = DEFAULT_RESOURCE_LIMIT,
    ) -> tuple[str, list[str], list[str]]:
        """Returns (json_result, resource_ids, resource_types)."""
        try:
            rows = await get_fhir_by_type(
                self.db, self.patient_id, resource_type, limit
            )
            ids = [r["resource_id"] for r in rows]
            types = [resource_type] if resource_type and rows else []
            return (
                _truncate({"resources": rows, "count": len(rows)}, "resources_by_type"),
                ids,
                types,
            )
        except Exception as e:
            logger.error(
                "repo_error | method=resources_by_type | type=%s | error=%s",
                resource_type,
                e,
            )
            return json.dumps({"error": str(e)}), [], []

    async def resources_by_keyword(
        self,
        keyword: str,
        limit: int = DEFAULT_KEYWORD_LIMIT,
    ) -> tuple[str, list[str], list[str]]:
        """Returns (json_result, resource_ids, resource_types)."""
        try:
            rows = await search_resources_by_keyword(
                self.db, self.patient_id, keyword, limit
            )
            ids = [r["resource_id"] for r in rows]
            types = list(
                {r["resource_type"] for r in rows if r.get("resource_type")}
            )
            return (
                _truncate({"resources": rows, "count": len(rows)}, "resources_by_keyword"),
                ids,
                types,
            )
        except Exception as e:
            logger.error(
                "repo_error | method=resources_by_keyword | keyword=%s | error=%s",
                keyword,
                e,
            )
            return json.dumps({"error": str(e)}), [], []

    async def resources_by_raw_sql(self, sql: str) -> tuple[str, list[str], list[str]]:
        """Returns (json_result, resource_ids, resource_types). Validates SQL first."""
        try:
            validated = validate_sql(sql)
        except SQLValidationError as e:
            return json.dumps({"error": str(e)}), [], []
        try:
            rows = await execute_raw_sql(
                self.db, validated, {"pid": self.patient_id}
            )
            ids = [
                str(r.get("resource_id") or r.get("id"))
                for r in rows
                if r.get("resource_id") or r.get("id")
            ]
            types = list(
                {r["resource_type"] for r in rows if r.get("resource_type")}
            )
            return (
                _truncate({"rows": rows, "count": len(rows)}, "resources_by_raw_sql"),
                ids,
                types,
            )
        except Exception as e:
            logger.error("repo_error | method=resources_by_raw_sql | error=%s", e)
            return json.dumps({"error": str(e)}), [], []

    async def fhir_resources_schema_info(self) -> str:
        """Returns JSON schema description of fhir_resources table."""
        try:
            data = await get_fhir_resources_schema_info(self.db)
            return json.dumps(data, default=str)
        except Exception as e:
            logger.error("repo_error | method=fhir_resources_schema_info | error=%s", e)
            return json.dumps({"error": str(e)})

    def finish_with_answer(self, answer: str, resource_ids: list[str]) -> str:
        """Package the final answer as a JSON string for ToolMessage content."""
        return json.dumps(
            {
                "answer": answer,
                "resource_ids": list(dict.fromkeys(resource_ids)),
                "resource_types": [],
            }
        )
