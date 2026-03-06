"""All magic numbers for the agentic strategy. Never hardcode in strategy/executor/guard."""

# Agent loop
MAX_TURNS = 15  # Max tool-calling rounds before forcing an answer
MAX_TOTAL_TOOL_CHARS = 200_000  # ~50K tokens — total context budget for all tool results
MAX_SINGLE_RESULT_CHARS = 50_000  # ~12.5K tokens — cap per individual tool result

# SQL guard
SQL_MAX_ROWS = 50  # Hard cap on rows from execute_sql
ALLOWED_TABLES = {"fhir_resources", "fhir_note_text"}

# Retry
MAX_RETRIES = 2  # Retries per LLM call (not per turn — per API call)
RETRY_BASE_DELAY = 30  # Seconds — doubles on each retry (30, 60)
RETRYABLE_STATUS_CODES = {429, 500, 503}

# Defaults
DEFAULT_RESOURCE_LIMIT = 20
DEFAULT_KEYWORD_LIMIT = 10
DEFAULT_NOTE_LIMIT = 5
