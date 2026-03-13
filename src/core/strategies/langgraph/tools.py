from typing import Annotated

from langchain_core.tools import tool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.strategies.utils.constants import DEFAULT_KEYWORD_LIMIT, DEFAULT_RESOURCE_LIMIT, MAX_SQL_ROWS
from src.core.strategies.utils.tool_executor import ToolExecutor


def create_fhir_tools(
    session_factory: async_sessionmaker[AsyncSession],
    patient_id: str,
    resource_types_collector: set[str] | None = None,
) -> list:
    """Return list of @tool-decorated functions for FHIR queries.
    If resource_types_collector is provided, resource types from each tool call are added to it."""

    def _update_resource_types_collector(types: list[str]) -> None:
        if resource_types_collector is not None and types:
            resource_types_collector.update(types)

    @tool
    async def get_patient_overview() -> str:
        """
        Call this FIRST ONLY when the patient asks a question about their health records,
        clinical data, or anything stored in FHIR (conditions, medications, labs, etc.)
        AND you do not yet know what data exists for them.
 
        Returns a lightweight summary of available resource types and date ranges —
        no clinical content. Use it to plan which specific tools to call next.
 
        DO NOT call this for greetings, small talk, or questions that don't require
        FHIR data (e.g. "Hi", "Thanks", "What can you do?").
 
        Example triggers:
        - "What conditions do I have?" -> call this first to see if Condition data exists
        - "Summarize my health" -> call this first to know what's available
        - "Do I have any allergies?" -> call this first if you haven't fetched an overview yet
        
        The patient's FHIR data is stored in the `fhir_resources` table with columns:
        - id (UUID PK)
        - patient_id (UUID)
        - resource_type (TEXT)
        - fhir_id (TEXT)
        - fhir_version (TEXT)
        - resource (JSONB — full FHIR data)
        - received_at (TIMESTAMP)
        - kno2_request_ref (BOOLEAN)
        - has_document_text (BOOLEAN)
        """
        async with session_factory() as db:
            executor = ToolExecutor(db, patient_id)
            result, _, resource_types = await executor.execute("get_patient_overview", {})
            _update_resource_types_collector(resource_types)
            return result

    @tool
    async def get_resources_by_type(
        resource_type: Annotated[
            str,
            "Exact FHIR resource type, e.g. Condition, Observation, MedicationRequest. Not plural.",
        ],
        limit: Annotated[
            int,
            "Max resources to return. Start with 5-10. Increase only if needed.",
        ] = DEFAULT_RESOURCE_LIMIT,
    ) -> str:
        """
        Fetch FHIR resources of a specific type for the patient. Use when you need ANY FHIR resource data 
        (conditions, observations, medications, etc.). Prefer this over execute_sql. resource_type must be from FHIR Resource Types: 
        Condition, Observation, MedicationRequest, AllergyIntolerance, Procedure, etc. 
        
        Start with limit 5-10. Increase only if needed.
        """
        async with session_factory() as db:
            executor = ToolExecutor(db, patient_id)
            result, _, types = await executor.execute(
                "get_resources_by_type", {"resource_type": resource_type, "limit": limit}
            )
            _update_resource_types_collector(types)
            return result

    @tool
    async def search_resources_by_keyword(
        keyword: Annotated[
            str,
            "Search term, e.g. diabetes, hypertension, medication name.",
        ],
        limit: Annotated[
            int,
            "Max resources to return. Start with 5-10.",
        ] = DEFAULT_KEYWORD_LIMIT,
    ) -> str:
        """
        Search FHIR resources by keyword in the JSON content (ILIKE). Use when the patient asks about a specific term 
        (e.g. 'diabetes', 'blood pressure', 'insulin'). Start with limit 5-10. Each tool call adds to context.
        """
        async with session_factory() as db:
            executor = ToolExecutor(db, patient_id)
            result, _, types = await executor.execute(
                "search_resources_by_keyword", {"keyword": keyword, "limit": limit}
            )
            _update_resource_types_collector(types)
            return result

    @tool(description=(
        f"""Use ONLY when structured tools (get_resources_by_type, search_resources_by_keyword)
        cannot answer. Execute a SELECT query. SQL must use :pid for patient_id (never hardcode).
        Allowed tables: fhir_resources. LIMIT is enforced (max {MAX_SQL_ROWS} rows).
        Call get_fhir_resources_schema_info first if unsure of column names."""
    ))
    async def execute_sql(
        sql: Annotated[
            str,
            "SELECT query. Must include WHERE patient_id = :pid. Example: SELECT id AS resource_id, resource_type "
            "FROM fhir_resources WHERE patient_id = :pid AND resource_type = 'Condition' LIMIT 10",
        ],
    ) -> str:
        async with session_factory() as db:
            executor = ToolExecutor(db, patient_id)
            result, _, types = await executor.execute("execute_sql", {"sql": sql})
            _update_resource_types_collector(types)
            return result

    @tool
    async def get_fhir_resources_schema_info() -> str:
        """Returns column names and types for fhir_resources table. Call this before execute_sql if you need schema details to write correct SQL."""
        
        async with session_factory() as db:
            executor = ToolExecutor(db, patient_id)
            result, _, _ = await executor.execute("get_fhir_resources_schema_info", {})
        return result

    @tool
    async def finish_with_answer(
        answer: Annotated[str, "Your final plain-English answer to the patient."],
        resource_ids: Annotated[
            list[str],
            "FHIR resource_id UUIDs you cited. Only IDs you actually referenced.",
        ] | None = None,
    ) -> str:
        """Call when you have enough data to answer. Stops the loop."""
        async with session_factory() as db:
            executor = ToolExecutor(db, patient_id)
            result, _, _ = await executor.execute(
                "finish_with_answer",
                {"answer": answer, "resource_ids": resource_ids},
            )
        return result

    return [
        get_patient_overview,
        get_resources_by_type,
        search_resources_by_keyword,
        execute_sql,
        get_fhir_resources_schema_info,
        finish_with_answer,
    ]