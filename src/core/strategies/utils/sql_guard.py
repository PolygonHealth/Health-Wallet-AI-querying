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
# LLM often writes resource_id but fhir_resources has column id. Rewrite in SELECT list.
_RESOURCE_ID_IN_SELECT = re.compile(
    r"((?:,\s*)|\bSELECT\s+)\bid\b(?!\s+AS\s+\w+|\s*,|\s*FROM)",
    re.IGNORECASE,
)

# At the top with your other patterns
_JSONB_ARROW_BEFORE_STRING_OP = re.compile(
    r"->'[^']+'\s+(ILIKE|LIKE|NOT\s+LIKE|NOT\s+ILIKE|=|!=|<>|IN)\s+",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Column alias normalisation
#
# The table has column `id` (UUID PK). The LLM may write any of:
#
#   Case A: SELECT resource_id ...        → LLM hallucinated column name
#           fix: replace with `id AS resource_id`
#
#   Case B: SELECT id ...                 → correct column, missing alias
#           fix: replace with `id AS resource_id`
#
#   Case C: SELECT id AS resource_id ...  → already correct, leave alone
#
#   Case D: SELECT id AS foo ...          → user chose different alias, leave alone
#
# We only operate on the SELECT column list (before the first FROM), so
# `id` or `resource_id` in WHERE / ORDER BY clauses are never touched.
# ---------------------------------------------------------------------------
 
# Matches the SELECT column list slice (between SELECT and FROM).
_SELECT_COLS_RE = re.compile(
    r"(?P<pre>SELECT\s+)(?P<cols>.+?)(?P<from>\s+FROM\b)",
    re.IGNORECASE | re.DOTALL,
)
 
# Matches bare `resource_id` in the column list (the hallucinated column name).
# Excludes qualified forms like `t.resource_id`.
_BARE_RESOURCE_ID = re.compile(r"(?<![.\w])\bresource_id\b", re.IGNORECASE)
 
# Matches bare `id` in the column list that is NOT already aliased (id AS ...).
# Excludes: fhir_id (preceded by word char), t.id (preceded by dot).
_BARE_ID_UNALIASED = re.compile(
    r"(?<![.\w])\bid\b(?!\s+AS\b)", re.IGNORECASE
)

def _normalise_id_alias(sql: str) -> str:
    """Rewrite the SELECT list so the PK surfaces as `resource_id`.
 
    Handles three LLM patterns:
      SELECT resource_id  → SELECT id AS resource_id   (hallucinated column)
      SELECT id           → SELECT id AS resource_id   (correct col, no alias)
      SELECT id AS resource_id → unchanged             (already correct)
      SELECT id AS foo    → unchanged                  (explicit alias kept)
      SELECT fhir_id      → unchanged                  (different column)
      SELECT *            → unchanged                  (wildcard)
    """
    m = _SELECT_COLS_RE.match(sql)
    if not m:
        return sql  # can't parse — leave untouched
 
    cols = m.group("cols")
 
    # Case C: already correct — nothing to do.
    if re.search(r"(?<![.\w])\bid\s+AS\s+resource_id\b", cols, re.IGNORECASE):
        return sql
 
    # Case A: LLM wrote `resource_id` as a column name — replace with `id AS resource_id`.
    if _BARE_RESOURCE_ID.search(cols):
        new_cols = _BARE_RESOURCE_ID.sub("id AS resource_id", cols)
        return m.group("pre") + new_cols + m.group("from") + sql[m.end():]
 
    # Case B: bare `id` without alias — add alias.
    if _BARE_ID_UNALIASED.search(cols):
        new_cols = _BARE_ID_UNALIASED.sub("id AS resource_id", cols)
        return m.group("pre") + new_cols + m.group("from") + sql[m.end():]
 
    return sql
 

def validate_sql(sql: str) -> str:
    sql = sql.strip()
    if not sql:
        raise SQLValidationError("SQL cannot be empty.")

    # Rewrite resource_id -> id AS resource_id only when LLM used resource_id as column.
    # (fhir_resources has id, not resource_id. Skip if already id or id AS resource_id.)
    sql = _normalise_id_alias(sql)

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