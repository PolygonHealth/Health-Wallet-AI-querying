"""Dispatches tool calls to DB queries. Injects patient_id, truncates results, returns JSON."""

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
    get_patient_overview,
    get_fhir_by_type,
    get_fhir_resources_schema_info,
    search_resources_by_keyword,
)

logger = logging.getLogger(__name__)

_TRUNCATION_MESSAGE = (
    "Result truncated. Use more specific filters (e.g. resource type, keyword) to reduce result size."
)

class ToolExecutor:
    """Executes agentic tools. Injects patient_id from context. Returns (json_result, resource_ids, resource_types)."""

    def __init__(self, db: AsyncSession, patient_id: str) -> None:
        self.db = db
        self.patient_id = patient_id

    @staticmethod
    def _extract_resource_types(data: dict | list) -> list[str]:
        """Extract unique resource_type values from query results."""
        seen: set[str] = set()
        if isinstance(data, dict):
            if "by_type" in data:
                for item in data["by_type"]:
                    if isinstance(item, dict) and item.get("resource_type"):
                        seen.add(str(item["resource_type"]).strip())
            if "resources" in data:
                for r in data["resources"]:
                    if isinstance(r, dict) and r.get("resource_type"):
                        seen.add(str(r["resource_type"]).strip())
            if "rows" in data:
                for r in data["rows"]:
                    if isinstance(r, dict) and r.get("resource_type"):
                        seen.add(str(r["resource_type"]).strip())
        return sorted(seen)

    async def execute(
        self, tool_name: str, args: dict
    ) -> tuple[str, list[str], list[str]]:
        """
        Execute tool and return (json_result, resource_ids, resource_types).
        Result is truncated if exceeding MAX_SINGLE_RESULT_CHARS.
        Errors are returned as {"error": "..."}.
        """
        try:
            result, resource_ids, resource_types = await self._dispatch(tool_name, args)
            json_str = json.dumps(result, default=str)
            if len(json_str) > MAX_SINGLE_RESULT_CHARS:
                logger.warning(
                    "tool_result_truncated | tool=%s | size=%d | cap=%d",
                    tool_name,
                    len(json_str),
                    MAX_SINGLE_RESULT_CHARS,
                )
                truncated = {
                    "truncated": True,
                    "message": _TRUNCATION_MESSAGE,
                    "chars_returned": MAX_SINGLE_RESULT_CHARS,
                    "total_chars": len(json_str),
                }
                json_str = json.dumps(truncated, default=str)
            return json_str, resource_ids, resource_types
        except Exception as e:
            logger.error("tool_error | tool=%s | error=%s", tool_name, str(e))
            return json.dumps({"error": str(e)}), [], []

    async def _dispatch(
        self, tool_name: str, args: dict
    ) -> tuple[dict | list, list[str], list[str]]:
        """Dispatch to appropriate query. Returns (data, resource_ids, resource_types)."""
        if tool_name == "get_patient_overview":
            data = await get_patient_overview(self.db, self.patient_id)
            return data, [], []

        if tool_name == "get_resources_by_type":
            resource_type = args.get("resource_type", "")
            limit = args.get("limit", DEFAULT_RESOURCE_LIMIT)
            rows = await get_fhir_by_type(self.db, self.patient_id, resource_type, limit)
            ids = [r["resource_id"] for r in rows]
            types = [resource_type] if resource_type and rows else []
            return {"resources": rows, "count": len(rows)}, ids, types

        if tool_name == "search_resources_by_keyword":
            keyword = args.get("keyword", "")
            limit = args.get("limit", DEFAULT_KEYWORD_LIMIT)
            rows = await search_resources_by_keyword(
                self.db, self.patient_id, keyword, limit
            )
            ids = [r["resource_id"] for r in rows]
            types = self._extract_resource_types({"resources": rows})
            return {"resources": rows, "count": len(rows)}, ids, types

        if tool_name == "execute_sql":
            sql = args.get("sql", "")
            try:
                validated = validate_sql(sql)
            except SQLValidationError as e:
                return {"error": str(e)}, [], []
            params = {"pid": self.patient_id}
            rows = await execute_raw_sql(self.db, validated, params)
            ids = [
                str(r.get("resource_id") or r.get("id"))
                for r in rows
                if r.get("resource_id") or r.get("id")
            ]
            types = self._extract_resource_types({"rows": rows})
            return {"rows": rows, "count": len(rows)}, ids, types

        if tool_name == "get_fhir_resources_schema_info":
            schema = await get_fhir_resources_schema_info(self.db)
            return schema, [], []

        if tool_name == "finish_with_answer":
            answer = args.get("answer", "")
            ids = args.get("resource_ids") or []
            return {"acknowledged": True, "answer": answer, "resource_ids": ids, "resource_types": []}, ids, []

        return {"error": f"Unknown tool: {tool_name}"}, [], []
