"""Gemini tool definitions (FunctionDeclarations) for the agentic strategy."""

from google.genai import types


def get_agentic_tools() -> list[types.Tool]:
    """Return list of Tool objects with function declarations for the agentic strategy."""
    declarations = [
        _get_patient_overview(),
        _get_resources_by_type(),
        _search_resources_by_keyword(),
        _execute_sql(),
        _get_schema_info(),
        _finish_with_answer(),
    ]
    return [types.Tool(function_declarations=declarations)]


def _get_patient_overview() -> types.FunctionDeclaration:
    """Tier 1: ALWAYS call FIRST. Lightweight counts + date ranges, no clinical data."""
    return types.FunctionDeclaration(
        name="get_patient_overview",
        description="ALWAYS call this FIRST. Returns a lightweight overview of the patient's data: resource type counts and date ranges. No clinical content. Use this to decide what to fetch next. Example: if overview shows 5 Conditions and 10 Observations, you can then fetch specific types.",
        parameters={
            "type": "object",
            "properties": {},
            "required": [],
        },
    )


def _get_resources_by_type() -> types.FunctionDeclaration:
    """Tier 1: Fetch FHIR resources by type."""
    return types.FunctionDeclaration(
        name="get_resources_by_type",
        description="Fetch FHIR resources of a specific type for the patient. Use when you need clinical data (conditions, observations, medications, etc.). Prefer this over execute_sql. resource_type must be exact: Condition, Observation, MedicationRequest, AllergyIntolerance, Procedure, etc. Start with limit 5-10. Increase only if needed.",
        parameters={
            "type": "object",
            "properties": {
                "resource_type": {
                    "type": "string",
                    "description": "Exact FHIR resource type, e.g. Condition, Observation, MedicationRequest. Not plural.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max resources to return. Start with 5-10. Increase only if needed.",
                },
            },
            "required": ["resource_type"],
        },
    )


def _search_resources_by_keyword() -> types.FunctionDeclaration:
    """Tier 1: Search resources by keyword in JSON content."""
    return types.FunctionDeclaration(
        name="search_resources_by_keyword",
        description="Search FHIR resources by keyword in the JSON content (ILIKE). Use when the patient asks about a specific term (e.g. 'diabetes', 'blood pressure', 'insulin'). Start with limit 5-10. Each tool call adds to context.",
        parameters={
            "type": "object",
            "properties": {
                "keyword": {
                    "type": "string",
                    "description": "Search term, e.g. diabetes, hypertension, medication name.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max resources to return. Start with 5-10.",
                },
            },
            "required": ["keyword"],
        },
    )


def _execute_sql() -> types.FunctionDeclaration:
    """Tier 2: Raw SQL. Use ONLY when structured tools cannot answer."""
    return types.FunctionDeclaration(
        name="execute_sql",
        description="Use ONLY when structured tools (get_resources_by_type, search_resources_by_keyword) cannot answer. Execute a SELECT query. SQL must use :pid for patient_id (never hardcode). Allowed tables: fhir_resources, fhir_note_text. LIMIT is enforced (max 50 rows). Call get_schema_info first if unsure of column names.",
        parameters={
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "SELECT query. Must include WHERE patient_id = :pid. Example: SELECT id, resource_type FROM fhir_resources WHERE patient_id = :pid AND resource_type = 'Condition' LIMIT 10",
                },
            },
            "required": ["sql"],
        },
    )


def _get_schema_info() -> types.FunctionDeclaration:
    """Tier 2: Returns table schema for SQL writing."""
    return types.FunctionDeclaration(
        name="get_schema_info",
        description="Returns column names and types for fhir_resources and fhir_note_text. Call this before execute_sql if you need schema details to write correct SQL.",
        parameters={
            "type": "object",
            "properties": {},
            "required": [],
        },
    )


def _finish_with_answer() -> types.FunctionDeclaration:
    """Tier 3: Explicit signal that LLM has enough data to answer."""
    return types.FunctionDeclaration(
        name="finish_with_answer",
        description="Call when you have enough data to answer the patient's question. Pass your answer as the 'answer' parameter. Use this to explicitly signal completion instead of relying on text output.",
        parameters={
            "type": "object",
            "properties": {
                "answer": {
                    "type": "string",
                    "description": "Your final answer to the patient's question in plain English. Cite resource IDs when referencing data.",
                },
            },
            "required": ["answer"],
        },
    )
