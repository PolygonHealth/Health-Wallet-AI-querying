import { logger } from '../config/logging';

function formatError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error as any),
    };
  }
  return { message: String(error) };
}

export interface DatabasePool {
  query(text: string, params?: any[]): Promise<any>;
  end(): Promise<void>;
}

export async function getAllFHIRByPatient(db: DatabasePool, patientId: string): Promise<any[]> {
  logger.info(`fhir_query | patient_id=${patientId} | filter=all`);
  
  const result = await db.query(`
    SELECT id AS resource_id, resource_type, resource, received_at
    FROM fhir_resources
    WHERE patient_id = $1
    ORDER BY received_at
  `, [patientId]);

  const rows = result.rows.map((r: any) => ({
    resource_id: String(r.resource_id),
    resource_type: r.resource_type,
    resource: r.resource,
    received_at: r.received_at ? String(r.received_at) : "",
  }));

  logger.info(`getAllFHIRByPatient completed | patient_id=${patientId} | row_count=${rows.length}`);
  return rows;
}

export async function getPatientOverview(db: DatabasePool, patientId: string): Promise<any> {
  logger.info(`fhir_overview | patient_id=${patientId}`);
  
  const result = await db.query(`
    SELECT
      resource_type,
      COUNT(*) AS count,
      MIN(received_at) AS min_date,
      MAX(received_at) AS max_date
    FROM fhir_resources
    WHERE patient_id = $1
    GROUP BY resource_type
    ORDER BY count DESC
  `, [patientId]);

  const rows = result.rows;
  const overview = {
    by_type: rows.map((r: any) => ({
      resource_type: r.resource_type,
      count: r.count,
      min_date: r.min_date ? String(r.min_date) : null,
      max_date: r.max_date ? String(r.max_date) : null,
    })),
    total_resources: rows.reduce((sum: number, r: any) => sum + r.count, 0),
  };

  logger.info(`fhir_overview_complete | patient_id=${patientId} | types=${rows.length}`);
  return overview;
}

export async function getFHIRByType(
  db: DatabasePool,
  patientId: string,
  resourceType: string,
  limit: number = 20
): Promise<any[]> {
  logger.info(`fhir_query | patient_id=${patientId} | filter=${resourceType} | limit=${limit}`);
  
  try {
    const result = await db.query(`
      SELECT id AS resource_id, resource_type, resource, received_at
      FROM fhir_resources
      WHERE patient_id = $1 AND resource_type = $2
      ORDER BY received_at
      LIMIT $3
    `, [patientId, resourceType, limit]);

    const rows = result.rows.map((r: any) => ({
      resource_id: String(r.resource_id),
      resource_type: r.resource_type,
      resource: r.resource,
      received_at: r.received_at ? String(r.received_at) : "",
    }));

    logger.info(`getFHIRByType completed | patient_id=${patientId} | row_count=${rows.length}`);
    return rows;
  } catch (error) {
    logger.warn(
      `fhir_query_failed | patient_id=${patientId} | filter=${resourceType} | error=${String(error)}`
    );
    throw error;
  }
}

export async function searchResourcesByKeyword(
  db: DatabasePool,
  patientId: string,
  keyword: string,
  limit: number = 10
): Promise<any[]> {
  logger.info(`fhir_search | patient_id=${patientId} | keyword=${keyword} | limit=${limit}`);
  const pattern = `%${keyword}%`;
  
  try {
    const result = await db.query(`
      SELECT id AS resource_id, resource_type, resource, received_at
      FROM fhir_resources
      WHERE patient_id = $1 AND resource::text ILIKE $2
      ORDER BY received_at
      LIMIT $3
    `, [patientId, pattern, limit]);

    const rows = result.rows.map((r: any) => ({
      resource_id: String(r.resource_id),
      resource_type: r.resource_type,
      resource: r.resource,
      received_at: r.received_at ? String(r.received_at) : "",
    }));

    logger.info(`fhir_search_complete | patient_id=${patientId} | row_count=${rows.length}`);
    return rows;
  } catch (error) {
    logger.warn(
      `fhir_search_failed | patient_id=${patientId} | keyword=${keyword} | error=${String(error)}`
    );
    throw error;
  }
}

export async function executeRawSQL(
  db: DatabasePool,
  sql: string,
  params: any
): Promise<any[]> {
  logger.info(`sql_execute | sql_preview=${sql}`);
  
  try {
    const result = await db.query(sql, params);
    const rows = result.rows;

    const out = rows.map((r: any) => {
      const d = { ...r };
      for (const [k, v] of Object.entries(d)) {
        if (v !== null && typeof v === 'object' && 'toISOString' in v) {
          d[k] = (v as Date).toISOString();
        } else if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) {
          d[k] = String(v);
        }
      }
      return d;
    });

    return out;
  } catch (error) {
    logger.warn('sql_execute_failed', { sql, error: formatError(error) });
    throw error;
  }
}

export async function getFHIRResourcesSchemaInfo(db: DatabasePool): Promise<any> {
  const result = await db.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name IN ('fhir_resources')
    ORDER BY table_name, ordinal_position
  `);

  const schema: { [key: string]: any[] } = {};
  for (const r of result.rows) {
    const table = r.table_name;
    if (!schema[table]) {
      schema[table] = [];
    }
    schema[table].push({ column: r.column_name, type: r.data_type });
  }
  
  return schema;
}


// Get patient record by profile ID with clear_verifications
export const getPatientByProfileId = async (db: DatabasePool, profileId: number) => {
  const query = `
    SELECT 
      p.patient_id,
      p.profile_id,
      p.current_verification_id,
      p.created_at as patient_created_at,
      p.updated_at as patient_updated_at,
      cv.verification_id,
      cv.clear_identity_token,
      cv.claims,
      cv.verified_at,
      cv.verification_status,
      cv.verification_level,
      cv.created_at as verification_created_at
    FROM patients p
    LEFT JOIN clear_verifications cv ON p.current_verification_id = cv.verification_id
    WHERE p.profile_id = $1
  `;
  const result = await db.query(query, [profileId]);
  return result.rows[0];
};


// Get FHIR data for specific patient
export const getFHIRUISummaryDataByPatientId = async (db: DatabasePool, patientId: string) => {
  // TODO: Replace with your provided query that produces same structure as fhir.json
  const query = "SELECT get_patient_summary($1, true) as fhir_data"
  const result = await db.query(query, [patientId]);
  return result.rows[0]?.fhir_data || {};
};