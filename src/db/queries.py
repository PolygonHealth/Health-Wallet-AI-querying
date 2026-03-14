import logging
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
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

    logger.info("get_patient_overview | patient_id=%s", patient_id)
    try:
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

    except DBAPIError as e:
        logger.error("get_patient_overview_failed | patient_id=%s | error=%s", patient_id, str(e))
        raise ValueError("Invalid patient_id: must be a valid UUID.") from e

    except Exception as e:
        logger.error("get_patient_overview_failed | patient_id=%s | error=%s", patient_id, str(e))
        raise e
    
    if not rows:
        raise ValueError(f"No resources found for patient {patient_id}. Patient does not exist!")
    
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
    logger.info("get_patient_overview_complete | patient_id=%s | types=%d", patient_id, len(rows))
    return overview


async def get_fhir_by_type(
    db: AsyncSession,
    patient_id: str,
    resource_type: str,
    limit: int = 20,
) -> list[dict]:
    """Fetch FHIR resources for a patient filtered by type (e.g., 'Condition', 'Observation')."""

    logger.info("fhir_query | patient_id=%s | filter=%s | limit=%d", patient_id, resource_type, limit)
    try:
        async with db.begin_nested():
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
            rows = result.fetchall()
    except Exception as e:
        logger.warning(
            "fhir_query_failed | patient_id=%s | filter=%s | error=%s",
            patient_id, resource_type, str(e),
        )
        raise ValueError(f"Failed to get FHIR resources by type {resource_type} for patient {patient_id}: {str(e)}")

    out = [
        {
            "resource_id": str(r.resource_id),
            "resource_type": r.resource_type,
            "resource": r.resource,
            "received_at": str(r.received_at) if r.received_at else "",
        }
        for r in rows
    ]
    logger.info(
        "fhir_query_complete | patient_id=%s | row_count=%d", patient_id, len(out)
    )
    return out


async def search_resources_by_keyword(
    db: AsyncSession,
    patient_id: str,
    keyword: str,
    limit: int = 10,
) -> list[dict]:
    """Search FHIR resources by keyword in JSON content (ILIKE)."""

    logger.info("fhir_search | patient_id=%s | keyword=%s | limit=%d", patient_id, keyword, limit)
    pattern = f"%{keyword}%"
    try:
        async with db.begin_nested():
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
            rows = result.fetchall()
    except Exception as e:
        logger.warning(
            "fhir_search_failed | patient_id=%s | keyword=%s | error=%s",
            patient_id, keyword, str(e),
        )
        raise ValueError(f"Failed to search resources by keyword {keyword} for patient {patient_id}: {str(e)}")

    out = [
        {
            "resource_id": str(r.resource_id),
            "resource_type": r.resource_type,
            "resource": r.resource,
            "received_at": str(r.received_at) if r.received_at else "",
        }
        for r in rows
    ]
    logger.info(
        "fhir_search_complete | patient_id=%s | row_count=%d", patient_id, len(out)
    )
    return out


async def execute_raw_sql(
    db: AsyncSession,
    sql: str,
    params: dict,
) -> list[dict]:
    """Execute validated SQL with bound parameters."""
    logger.info("sql_execute | sql_preview=%s", sql)
    try:
        async with db.begin_nested():
            result = await db.execute(text(sql), params)
            rows = result.fetchall()
    except Exception as e:
        logger.warning("sql_execute_failed | error=%s | sql=%s", str(e), sql)
        raise ValueError(f"Failed to execute raw SQL: {str(e)}")

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

    try:
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

        if not result.fetchall():
            raise ValueError("No schema found for 'fhir_resources'.")
        
        for r in result.fetchall():
            table = r.table_name
            if table not in schema:
                schema[table] = []
                schema[table].append({"column": r.column_name, "type": r.data_type})
            return schema
        
    except Exception as e:
        logger.error("get_fhir_resources_schema_info_failed | error=%s", str(e))
        raise e