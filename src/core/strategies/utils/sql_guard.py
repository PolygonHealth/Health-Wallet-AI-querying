"""SQL validation for LLM-generated SQL. Security boundary — must be paranoid."""

import re

from src.core.strategies.utils.constants import ALLOWED_TABLES, SQL_MAX_ROWS


class SQLValidationError(Exception):
    """Raised when SQL fails validation. Executor catches and returns as tool result."""

    pass


# Forbidden patterns (case-insensitive)
_FORBIDDEN_PATTERNS = [
    r"\bdelete\b",
    r"\bdrop\b",
    r"\binsert\b",
    r"\bupdate\b",
    r"\balter\b",
    r"\btruncate\b",
    r"\bcreate\b",
    r"\bgrant\b",
    r"\brevoke\b",
    r"\bexec\b",
    r"\bexecute\b",
]
_FORBIDDEN_RE = re.compile("|".join(f"(?i:{p})" for p in _FORBIDDEN_PATTERNS))

# Extract table names from FROM and JOIN clauses (simple pattern)
_TABLE_PATTERN = re.compile(
    r"\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)",
    re.IGNORECASE,
)
# Match LIMIT N
_LIMIT_PATTERN = re.compile(r"\blimit\s+(\d+)\b", re.IGNORECASE)
# Require :pid for parameterized patient scoping
_PID_REQUIRED = re.compile(r":pid\b")

# At the top with your other patterns
_JSONB_ARROW_BEFORE_STRING_OP = re.compile(
    r"->'[^']+'\s+(ILIKE|LIKE|NOT\s+LIKE|NOT\s+ILIKE|=|!=|<>|IN)\s+",
    re.IGNORECASE,
)

def validate_sql(sql: str) -> str:
    sql = sql.strip()
    if not sql:
        raise SQLValidationError("SQL cannot be empty.")

    # Reject forbidden patterns
    if _FORBIDDEN_RE.search(sql):
        raise SQLValidationError(
            "SQL contains forbidden operation (DELETE, DROP, INSERT, UPDATE, ALTER, TRUNCATE, etc.). Only SELECT is allowed."
        )

    # JSONB operator check — catch -> where ->> is needed
    if _JSONB_ARROW_BEFORE_STRING_OP.search(sql):
        raise SQLValidationError(
            "JSONB operator error: the -> operator returns JSONB, not TEXT. "
            "Use ->> (not ->) for the final key when comparing with ILIKE, LIKE, =, IN. "
            "WRONG: resource->'code'->'text' ILIKE '%foo%'  "
            "RIGHT: resource->'code'->>'text' ILIKE '%foo%'"
        )

    # Require :pid for patient scoping
    if not _PID_REQUIRED.search(sql):
        raise SQLValidationError(
            "SQL must use :pid parameter for patient_id. Example: WHERE patient_id = :pid"
        )

    # Extract and validate table names
    tables = set(m.group(1).lower() for m in _TABLE_PATTERN.finditer(sql))
    disallowed = tables - ALLOWED_TABLES
    if disallowed:
        raise SQLValidationError(
            f"Table(s) not allowed: {disallowed}. Allowed: {ALLOWED_TABLES}"
        )

    # Enforce LIMIT
    limit_match = _LIMIT_PATTERN.search(sql)
    if limit_match:
        limit_val = int(limit_match.group(1))
        if limit_val > SQL_MAX_ROWS:
            sql = _LIMIT_PATTERN.sub(f"LIMIT {SQL_MAX_ROWS}", sql, count=1)
    else:
        if sql.rstrip().endswith(";"):
            sql = sql.rstrip()[:-1] + f" LIMIT {SQL_MAX_ROWS};"
        else:
            sql = sql.rstrip() + f" LIMIT {SQL_MAX_ROWS}"

    return sql