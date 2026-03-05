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
            SELECT id, resource_type, resource, received_at
            FROM fhir_resources
            WHERE patient_id = :pid
            ORDER BY received_at
            """
        ),
        {"pid": patient_id},
    )
    rows = [
        {
            "id": str(r.id),
            "resource_type": r.resource_type,
            "resource": r.resource,
            "received_at": str(r.received_at) if r.received_at else "",
        }
        for r in result.fetchall()
    ]
    logger.info("fhir_query_complete | patient_id=%s | row_count=%d", patient_id, len(rows))
    return rows


async def get_fhir_by_type(
    db: AsyncSession, patient_id: str, resource_type: str
) -> list[dict]:
    """Fetch FHIR resources for a patient filtered by type (e.g., 'Condition', 'Observation')."""

    logger.info("fhir_query | patient_id=%s | filter=%s", patient_id, resource_type)
    result = await db.execute(
        text(
            """
            SELECT id, resource_type, resource, received_at
            FROM fhir_resources
            WHERE patient_id = :pid AND resource_type = :rt
            ORDER BY received_at
            """
        ),
        {"pid": patient_id, "rt": resource_type},
    )
    rows = [
        {
            "id": str(r.id),
            "resource_type": r.resource_type,
            "resource": r.resource,
            "received_at": str(r.received_at) if r.received_at else "",
        }
        for r in result.fetchall()
    ]
    logger.info("fhir_query_complete | patient_id=%s | row_count=%d", patient_id, len(rows))
    return rows