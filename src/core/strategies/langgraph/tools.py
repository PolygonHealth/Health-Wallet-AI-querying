from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Annotated

from langchain_core.tools import tool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.strategies.langgraph.repository import FhirRepository
from src.core.strategies.utils.constants import (
    DEFAULT_KEYWORD_LIMIT,
    DEFAULT_RESOURCE_LIMIT,
    SQL_MAX_ROWS,
)


@dataclass
class _RunContext:
    patient_id: str
    resource_types_collector: set[str] = field(default_factory=set)


_run_context: ContextVar[_RunContext] = ContextVar("_run_context")


def set_run_context(patient_id: str, collector: set[str]) -> None:
    """Call once in execute() before graph.ainvoke(). Task-safe."""
    _run_context.set(_RunContext(patient_id=patient_id, resource_types_collector=collector))


def _ctx() -> _RunContext:
    return _run_context.get()


def _fhir_resources_repo(db: AsyncSession) -> FhirRepository:
    return FhirRepository(db, _ctx().patient_id)


def _collect(types: list[str]) -> None:
    if types:
        _ctx().resource_types_collector.update(types)


def create_fhir_tools(session_factory: async_sessionmaker[AsyncSession]) -> list:
    """Build tool list once. No patient_id — resolved at call time via ContextVar."""

    @tool
    async def get_patient_overview() -> str:
        """
        Call this FIRST when the patient asks about health records, clinical data, or FHIR —
        and you don't yet know what data exists. Returns a lightweight summary of available resource types and date ranges.
 
        fhir_resources table columns: 
        - id (UUID PK)
        - patient_id (UUID)
        - resource_type (TEXT)
        - fhir_id (TEXT)
        - fhir_version (TEXT)
        - resource (JSONB)
        - received_at (TIMESTAMP)
        - kno2_request_ref (BOOLEAN)
        - has_document_text (BOOLEAN)
        
        Returns counts and date ranges. No clinical content.
        """
        async with session_factory() as db:
            result, types = await _fhir_resources_repo(db).get_patient_overview()
            return result

    @tool
    async def get_resources_by_type(
        resource_type: Annotated[
            str,
            "Exact FHIR resource type, singular. E.g. Condition, Observation, MedicationRequest.",
        ],
        limit: Annotated[
            int,
            "Max resources. Start with 5-10.",
        ] = DEFAULT_RESOURCE_LIMIT,
    ) -> str:
        """
        Fetch FHIR resources of a specific type for the patient.
 
        Use when you know which resource type to fetch — either because the patient asked
        about it directly, or because get_patient_overview confirmed it exists.
 
        Prefer this over `execute_sql` for all standard resource type queries.

        resource_type must be exact and singular: Condition, Observation,
        MedicationRequest, AllergyIntolerance, Procedure, DiagnosticReport, etc.
        """
        async with session_factory() as db:
            result, _, types = await _fhir_resources_repo(db).get_resources_by_type(resource_type, limit)
            _collect(types)
            return result

    @tool
    async def search_resources_by_keyword(
        keyword: Annotated[
            str,
            "Search term to match against FHIR resource JSON content, e.g. 'diabetes', 'metformin'.",
        ],
        limit: Annotated[int, "Max resources. Start with 5-10."] = DEFAULT_KEYWORD_LIMIT,
    ) -> str:
        """
        Search across all FHIR resources by keyword (case-insensitive JSON content match).
 
        Use when the patient asks about a specific condition, medication, or clinical term
        and you want any record mentioning it — regardless of resource type.
 
        Prefer get_resources_by_type when the resource type is already known.
        """
        async with session_factory() as db:
            result, _, types = await _fhir_resources_repo(db).get_resources_by_keyword(keyword, limit)
            _collect(types)
            return result

    @tool(
        description=(
            f"Use ONLY if get_resources_by_type or search_resources_by_keyword cannot answer "
            f"(e.g. complex filtering, aggregation, joins). "
            f"Write a PostgreSQL SELECT query over the `fhir_resources` table only. "
            f"Use :pid for patient_id (never hardcode). LIMIT is required (max {SQL_MAX_ROWS}).\n\n"

            f"`resource` is JSONB. Access fields using -> or ->> (NOT dot notation).\n"
            f"When using jsonb_array_elements(), the alias is a JSON value, so use -> / ->>.\n\n"

            f"EXAMPLES:\n"
            f"SELECT id AS resource_id, p->'individual'->>'display'\n"
            f"FROM fhir_resources, jsonb_array_elements(resource->'participant') AS p\n"
            f"WHERE id = <uuid>\n\n"

            f"SELECT query using :pid for patient_id. "
            f"Example: SELECT id AS resource_id, resource_type FROM fhir_resources "
            f"WHERE patient_id = :pid AND resource_type = 'Condition' LIMIT 10"

            f"Incorrect: p.individual->>'display'\n"
        )
    )
    async def execute_sql(
        sql: Annotated[
            str,
            "SELECT query using :pid for patient_id. "
            "Example: SELECT id AS resource_id, resource_type FROM fhir_resources "
            "WHERE patient_id = :pid AND resource_type = 'Condition' LIMIT 10",
        ],
    ) -> str:
        async with session_factory() as db:
            result, _, types = await _fhir_resources_repo(db).get_resources_by_raw_sql(sql)
            _collect(types)
            return result

    @tool
    async def get_fhir_resources_schema_info() -> str:
        """
        Get the schema information for the fhir_resources table.
        """
        async with session_factory() as db:
            return await _fhir_resources_repo(db).get_fhir_resources_schema_info()

    @tool
    async def finish_with_answer(
        answer: Annotated[
            str,       
            "Your complete response to the patient in markdown (headings, bullets, bold). "
            "No tables — use bullet or numbered lists. No citation numbers or source sections. "
            "Include a brief 'Polly's note' summarizing key points in plain language. "
            "When referencing patient data: use inline citations (Resource ID: <uuid>) for tracking.",
        ],
        resource_ids: Annotated[
            list[str],
            "Resource IDs you cited inline in your answer.",
        ] | None = None,
    ) -> str:
        """Always call last. For FHIR questions: cite inline as (Resource ID: <uuid>). Never return text without calling this."""
        async with session_factory() as db:
            return _fhir_resources_repo(db).get_final_answer(answer, resource_ids or [])

    return [
        get_patient_overview,
        get_resources_by_type,
        search_resources_by_keyword,
        execute_sql,
        get_fhir_resources_schema_info,
        finish_with_answer,
    ]