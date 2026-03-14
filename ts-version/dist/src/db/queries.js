"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllFHIRByPatient = getAllFHIRByPatient;
exports.getPatientOverview = getPatientOverview;
exports.getFHIRByType = getFHIRByType;
exports.searchResourcesByKeyword = searchResourcesByKeyword;
exports.executeRawSQL = executeRawSQL;
exports.getFHIRResourcesSchemaInfo = getFHIRResourcesSchemaInfo;
const logging_1 = require("../config/logging");
async function getAllFHIRByPatient(db, patientId) {
    logging_1.logger.info(`fhir_query | patient_id=${patientId} | filter=all`);
    const result = await db.query(`
    SELECT id AS resource_id, resource_type, resource, received_at
    FROM fhir_resources
    WHERE patient_id = $1
    ORDER BY received_at
  `, [patientId]);
    const rows = result.rows.map((r) => ({
        resource_id: String(r.resource_id),
        resource_type: r.resource_type,
        resource: r.resource,
        received_at: r.received_at ? String(r.received_at) : "",
    }));
    logging_1.logger.info(`fhir_query_complete | patient_id=${patientId} | row_count=${rows.length}`);
    return rows;
}
async function getPatientOverview(db, patientId) {
    logging_1.logger.info(`fhir_overview | patient_id=${patientId}`);
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
        by_type: rows.map((r) => ({
            resource_type: r.resource_type,
            count: r.count,
            min_date: r.min_date ? String(r.min_date) : null,
            max_date: r.max_date ? String(r.max_date) : null,
        })),
        total_resources: rows.reduce((sum, r) => sum + r.count, 0),
    };
    logging_1.logger.info(`fhir_overview_complete | patient_id=${patientId} | types=${rows.length}`);
    return overview;
}
async function getFHIRByType(db, patientId, resourceType, limit = 20) {
    logging_1.logger.info(`fhir_query | patient_id=${patientId} | filter=${resourceType} | limit=${limit}`);
    try {
        const result = await db.query(`
      SELECT id AS resource_id, resource_type, resource, received_at
      FROM fhir_resources
      WHERE patient_id = $1 AND resource_type = $2
      ORDER BY received_at
      LIMIT $3
    `, [patientId, resourceType, limit]);
        const rows = result.rows.map((r) => ({
            resource_id: String(r.resource_id),
            resource_type: r.resource_type,
            resource: r.resource,
            received_at: r.received_at ? String(r.received_at) : "",
        }));
        logging_1.logger.info(`fhir_query_complete | patient_id=${patientId} | row_count=${rows.length}`);
        return rows;
    }
    catch (error) {
        logging_1.logger.warning(`fhir_query_failed | patient_id=${patientId} | filter=${resourceType} | error=${String(error)}`);
        throw error;
    }
}
async function searchResourcesByKeyword(db, patientId, keyword, limit = 10) {
    logging_1.logger.info(`fhir_search | patient_id=${patientId} | keyword=${keyword} | limit=${limit}`);
    const pattern = `%${keyword}%`;
    try {
        const result = await db.query(`
      SELECT id AS resource_id, resource_type, resource, received_at
      FROM fhir_resources
      WHERE patient_id = $1 AND resource::text ILIKE $2
      ORDER BY received_at
      LIMIT $3
    `, [patientId, pattern, limit]);
        const rows = result.rows.map((r) => ({
            resource_id: String(r.resource_id),
            resource_type: r.resource_type,
            resource: r.resource,
            received_at: r.received_at ? String(r.received_at) : "",
        }));
        logging_1.logger.info(`fhir_search_complete | patient_id=${patientId} | row_count=${rows.length}`);
        return rows;
    }
    catch (error) {
        logging_1.logger.warning(`fhir_search_failed | patient_id=${patientId} | keyword=${keyword} | error=${String(error)}`);
        throw error;
    }
}
async function executeRawSQL(db, sql, params) {
    logging_1.logger.info(`sql_execute | sql_preview=${sql}`);
    try {
        const result = await db.query(sql, params);
        const rows = result.rows;
        const out = rows.map((r) => {
            const d = { ...r };
            for (const [k, v] of Object.entries(d)) {
                if (v !== null && typeof v === 'object' && 'toISOString' in v) {
                    d[k] = v.toISOString();
                }
                else if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) {
                    d[k] = String(v);
                }
            }
            return d;
        });
        return out;
    }
    catch (error) {
        logging_1.logger.warning(`sql_execute_failed | error=${String(error)} | sql=${sql}`);
        throw error;
    }
}
async function getFHIRResourcesSchemaInfo(db) {
    const result = await db.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name IN ('fhir_resources')
    ORDER BY table_name, ordinal_position
  `);
    const schema = {};
    for (const r of result.rows) {
        const table = r.table_name;
        if (!schema[table]) {
            schema[table] = [];
        }
        schema[table].push({ column: r.column_name, type: r.data_type });
    }
    return schema;
}
//# sourceMappingURL=queries.js.map