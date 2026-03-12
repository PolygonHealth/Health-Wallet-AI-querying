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

    def _update_collector(types: list[str]) -> None:
        if resource_types_collector is not None and types:
            resource_types_collector.update(types)

    @tool
    async def get_patient_overview() -> str:
        """
        ALWAYS call this FIRST. Returns a lightweight overview of the patient's data:
        resource type counts and date ranges. No clinical content. Use this to decide
        what to fetch next. 
        
        Example: if overview shows 5 Conditions and 10 Observations,
        you can then fetch specific types.
        
        The underlying table is `fhir_resources` with columns:
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
            result, _, types = await executor.execute("get_patient_overview", {})
            _update_collector(types)
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
        (conditions, observations, medications, etc.). Prefer this over execute_sql. resource_type must be exact: 
        Condition, Observation, MedicationRequest, AllergyIntolerance, Procedure, etc. 
        
        Start with limit 5-10. Increase only if needed.
        """
        async with session_factory() as db:
            executor = ToolExecutor(db, patient_id)
            result, _, types = await executor.execute(
                "get_resources_by_type", {"resource_type": resource_type, "limit": limit}
            )
            _update_collector(types)
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
            _update_collector(types)
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
            _update_collector(types)
            return result

    @tool
    async def get_fhir_resources_schema_info() -> str:
        """Returns column names and types for fhir_resources table. Call this before execute_sql if you need schema details to write correct SQL."""
        
        async with session_factory() as db:
            executor = ToolExecutor(db, patient_id)
            result, _, _ = await executor.execute("get_fhir_resources_schema_info", {})
        return result

    return [
        get_patient_overview,
        get_resources_by_type,
        search_resources_by_keyword,
        execute_sql,
        get_fhir_resources_schema_info,
    ]