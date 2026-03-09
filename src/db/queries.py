import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def get_all_fhir_by_patient(db: AsyncSession, patient_id: str) -> list[dict]:
    """Fetch all FHIR resources for a patient. Returns id, resource_type, resource, received_at."""

    logger.info("fhir_query | patient_id=%s | filter=all", patient_id)
    result = await db.execute(
        text(
            """
            SELECT id AS resource_id, resource_type, resource, received_at
            FROM fhir_resources
            WHERE patient_id = :pid
            ORDER BY received_at
            """
        ),
        {"pid": patient_id},
    )
    rows = [
        {
            "resource_id": str(r.resource_id),
            "resource_type": r.resource_type,
            "resource": r.resource,
            "received_at": str(r.received_at) if r.received_at else "",
        }
        for r in result.fetchall()
    ]
    logger.info(
        "fhir_query_complete | patient_id=%s | row_count=%d", patient_id, len(rows)
    )
    return rows


async def get_patient_overview(db: AsyncSession, patient_id: str) -> dict:
    """Lightweight overview: resource type counts and date ranges. No clinical content."""

    logger.info("fhir_overview | patient_id=%s", patient_id)
    result = await db.execute(
        text(
            """
            SELECT
                resource_type,
                COUNT(*) AS count,
                MIN(received_at) AS min_date,
                MAX(received_at) AS max_date
            FROM fhir_resources
            WHERE patient_id = :pid
            GROUP BY resource_type
            ORDER BY count DESC
            """
        ),
        {"pid": patient_id},
    )
    rows = result.fetchall()
    overview = {
        "by_type": [
            {
                "resource_type": r.resource_type,
                "count": r.count,
                "min_date": str(r.min_date) if r.min_date else None,
                "max_date": str(r.max_date) if r.max_date else None,
            }
            for r in rows
        ],
        "total_resources": sum(r.count for r in rows),
    }
    logger.info("fhir_overview_complete | patient_id=%s | types=%d", patient_id, len(rows))
    return overview


async def get_fhir_by_type(
    db: AsyncSession,
    patient_id: str,
    resource_type: str,
    limit: int = 20,
) -> list[dict]:
    """Fetch FHIR resources for a patient filtered by type (e.g., 'Condition', 'Observation')."""

    logger.info("fhir_query | patient_id=%s | filter=%s | limit=%d", patient_id, resource_type, limit)
    result = await db.execute(
        text(
            """
            SELECT id AS resource_id, resource_type, resource, received_at
            FROM fhir_resources
            WHERE patient_id = :pid AND resource_type = :rt
            ORDER BY received_at
            LIMIT :lim
            """
        ),
        {"pid": patient_id, "rt": resource_type, "lim": limit},
    )
    rows = [
        {
            "resource_id": str(r.resource_id),
            "resource_type": r.resource_type,
            "resource": r.resource,
            "received_at": str(r.received_at) if r.received_at else "",
        }
        for r in result.fetchall()
    ]
    logger.info(
        "fhir_query_complete | patient_id=%s | row_count=%d", patient_id, len(rows)
    )
    return rows


async def search_resources_by_keyword(
    db: AsyncSession,
    patient_id: str,
    keyword: str,
    limit: int = 10,
) -> list[dict]:
    """Search FHIR resources by keyword in JSON content (ILIKE)."""

    logger.info("fhir_search | patient_id=%s | keyword=%s | limit=%d", patient_id, keyword, limit)
    pattern = f"%{keyword}%"
    result = await db.execute(
        text(
            """
            SELECT id AS resource_id, resource_type, resource, received_at
            FROM fhir_resources
            WHERE patient_id = :pid AND resource::text ILIKE :pat
            ORDER BY received_at
            LIMIT :lim
            """
        ),
        {"pid": patient_id, "pat": pattern, "lim": limit},
    )
    rows = [
        {
            "resource_id": str(r.resource_id),
            "resource_type": r.resource_type,
            "resource": r.resource,
            "received_at": str(r.received_at) if r.received_at else "",
        }
        for r in result.fetchall()
    ]
    logger.info(
        "fhir_search_complete | patient_id=%s | row_count=%d", patient_id, len(rows)
    )
    return rows


async def execute_raw_sql(
    db: AsyncSession,
    sql: str,
    params: dict,
) -> list[dict]:
    """Execute validated SQL with bound parameters. Used by agentic execute_sql tool."""

    logger.info("sql_execute | sql_preview=%s", sql[:200] if len(sql) > 200 else sql)
    result = await db.execute(text(sql), params)
    rows = result.fetchall()
    # Convert to list of dicts; serialize UUID/datetime for JSON
    out = []
    for r in rows:
        d = dict(r._mapping)
        for k, v in d.items():
            if v is not None and hasattr(v, "isoformat"):
                d[k] = v.isoformat()
            elif v is not None and not isinstance(v, (str, int, float, bool)):
                d[k] = str(v)
        out.append(d)
    return out


async def get_fhir_resources_schema_info(db: AsyncSession) -> dict:
    """Return column names and types for fhir_resources and fhir_note_text."""

    result = await db.execute(
        text(
            """
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name IN ('fhir_resources')
            ORDER BY table_name, ordinal_position
            """
        ),
    )
    schema: dict[str, list[dict]] = {}
    for r in result.fetchall():
        table = r.table_name
        if table not in schema:
            schema[table] = []
        schema[table].append({"column": r.column_name, "type": r.data_type})
    return schema
