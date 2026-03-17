// SQL validation for LLM-generated SQL. Security boundary — must be paranoid.

export class SQLValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SQLValidationError';
  }
}

// Forbidden patterns (case-insensitive)
const FORBIDDEN_PATTERNS = [
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\binsert\b/i,
  /\bupdate\b/i,
  /\balter\b/i,
  /\btruncate\b/i,
  /\bcreate\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bexec\b/i,
  /\bexecute\b/i,
];

// Extract table names from FROM and JOIN clauses (simple pattern)
const TABLE_PATTERN = /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
// Match LIMIT N
const LIMIT_PATTERN = /\blimit\s+(\d+)\b/i;
// Require $1 for parameterized patient scoping (pg positional params)
const PID_REQUIRED = /\bpatient_id\s*=\s*\$1\b/i;
// LLM often writes resource_id but fhir_resources has column id. Rewrite in SELECT list.
const RESOURCE_ID_IN_SELECT = /((?:,\s*)|\bSELECT\s+)\bid\b(?!\s+AS\s+\w+|\s*,|\s*FROM)/gi;

// JSONB operator check — catch -> where ->> is needed
const JSONB_ARROW_BEFORE_STRING_OP = /->'[^']+'\s+(ILIKE|LIKE|NOT\s+LIKE|NOT\s+ILIKE|=|!=|<>|IN)\s+/gi;

// ---------------------------------------------------------------------------
// Column alias normalisation
//
// The table has column `id` (UUID PK). The LLM may write any of:
//
//   Case A: SELECT resource_id ...        → LLM hallucinated column name
//           fix: replace with `id AS resource_id`
//
//   Case B: SELECT id ...                 → correct column, missing alias
//           fix: replace with `id AS resource_id`
//
//   Case C: SELECT id AS resource_id ...  → already correct, leave alone
//
//   Case D: SELECT id AS foo ...          → user chose different alias, leave alone
//
// We only operate on the SELECT column list (before the first FROM), so
// `id` or `resource_id` in WHERE / ORDER BY clauses are never touched.
// ---------------------------------------------------------------------------
 
// Matches the SELECT column list slice (between SELECT and FROM).
const SELECT_COLS_RE = /(SELECT\s+)(.+?)(\s+FROM\b)/i;
 
// Matches bare `resource_id` in the column list (the hallucinated column name).
// Excludes qualified forms like `t.resource_id`.
const BARE_RESOURCE_ID = /\bresource_id\b/gi;
 
// Matches bare `id` in the column list that is NOT already aliased (id AS ...).
// Excludes: fhir_id (preceded by word char), t.id (preceded by dot).
const BARE_ID_UNALIASED = /\bid\b(?!\s+AS\b)/gi;

function normaliseIdAlias(sql: string): string {
  /**Rewrite the SELECT list so the PK surfaces as `resource_id`.
 
  Handles three LLM patterns:
    SELECT resource_id  → SELECT id AS resource_id   (hallucinated column)
    SELECT id           → SELECT id AS resource_id   (correct col, no alias)
    SELECT id AS resource_id → unchanged             (already correct)
    SELECT id AS foo    → unchanged                  (explicit alias kept)
    SELECT fhir_id      → unchanged                  (different column)
    SELECT *            → unchanged                  (wildcard)
  */
  const match = SELECT_COLS_RE.exec(sql);
  if (!match) {
    return sql; // can't parse — leave untouched
  }
 
  const [fullMatch, pre, cols, from] = match;
 
  // Case C: already correct — nothing to do.
  if (/\bid\s+AS\s+resource_id\b/i.test(cols)) {
    return sql;
  }
 
  // Case A: LLM wrote `resource_id` as a column name — replace with `id AS resource_id`.
  if (BARE_RESOURCE_ID.test(cols)) {
    const newCols = cols.replace(BARE_RESOURCE_ID, 'id AS resource_id');
    return pre + newCols + from + sql.slice(match.index + fullMatch.length);
  }
 
  // Case B: bare `id` without alias — add alias.
  if (BARE_ID_UNALIASED.test(cols)) {
    const newCols = cols.replace(BARE_ID_UNALIASED, 'id AS resource_id');
    return pre + newCols + from + sql.slice(match.index + fullMatch.length);
  }
 
  return sql;
}

export function validateSQL(sql: string): string {
  sql = sql.trim();
  if (!sql) {
    throw new SQLValidationError('SQL cannot be empty.');
  }

  // Rewrite resource_id -> id AS resource_id only when LLM used resource_id as column.
  // (fhir_resources has id, not resource_id. Skip if already id or id AS resource_id.)
  sql = normaliseIdAlias(sql);

  // Reject forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(sql)) {
      throw new SQLValidationError(
        'SQL contains forbidden operation (DELETE, DROP, INSERT, UPDATE, ALTER, TRUNCATE, etc.). Only SELECT is allowed.'
      );
    }
  }

  // JSONB operator check — catch -> where ->> is needed
  if (JSONB_ARROW_BEFORE_STRING_OP.test(sql)) {
    throw new SQLValidationError(
      "JSONB operator error: the -> operator returns JSONB, not TEXT. " +
      "Use ->> (not ->) for the final key when comparing with ILIKE, LIKE, =, IN. " +
      "WRONG: resource->'code'->'text' ILIKE '%foo%'  " +
      "RIGHT: resource->'code'->>'text' ILIKE '%foo%'"
    );
  }

  // Require $1 for patient scoping
  if (!PID_REQUIRED.test(sql)) {
    throw new SQLValidationError(
      'SQL must scope to the current patient using $1. Example: WHERE patient_id = $1'
    );
  }

  // Extract and validate table names
  const tableMatches = [...sql.matchAll(TABLE_PATTERN)];
  const tables = new Set(tableMatches.map(m => m[1]?.toLowerCase()).filter(Boolean));
  const disallowed = [...tables].filter(table => !ALLOWED_TABLES.has(table));
  if (disallowed.length > 0) {
    throw new SQLValidationError(
      `Table(s) not allowed: ${disallowed.join(', ')}. Allowed: ${[...ALLOWED_TABLES].join(', ')}`
    );
  }

  // Enforce LIMIT
  const limitKeywordCount = (sql.match(/\blimit\b/gi) || []).length;
  if (limitKeywordCount > 1) {
    throw new SQLValidationError('SQL contains multiple LIMIT clauses. Use exactly one LIMIT.');
  }

  const limitMatch = LIMIT_PATTERN.exec(sql);
  if (limitMatch) {
    const limitVal = parseInt(limitMatch[1]);
    if (limitVal > SQL_MAX_ROWS) {
      sql = sql.replace(LIMIT_PATTERN, `LIMIT ${SQL_MAX_ROWS}`);
    }
  } else {
    if (sql.endsWith(';')) {
      sql = sql.slice(0, -1) + ` LIMIT ${SQL_MAX_ROWS};`;
    } else {
      sql = sql + ` LIMIT ${SQL_MAX_ROWS}`;
    }
  }

  return sql;
}

// Import SQL_MAX_ROWS and ALLOWED_TABLES from constants
import { SQL_MAX_ROWS, ALLOWED_TABLES } from './constants';
