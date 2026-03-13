import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DatabasePool } from '../../../db/session';
import { DEFAULT_KEYWORD_LIMIT, DEFAULT_RESOURCE_LIMIT, MAX_SQL_ROWS } from '../utils/constants';

// Zod schemas for tool inputs
const ResourcesByTypeSchema = z.object({
  resourceType: z.string().describe('Exact FHIR resource type, e.g. Condition, Observation, MedicationRequest. Not plural.'),
  limit: z.number().optional().default(DEFAULT_RESOURCE_LIMIT).describe('Max resources to return. Start with 5-10. Increase only if needed.')
});

const SearchResourcesSchema = z.object({
  keyword: z.string().describe('Search term, e.g. diabetes, hypertension, medication name.'),
  limit: z.number().optional().default(DEFAULT_KEYWORD_LIMIT).describe('Max resources to return. Start with 5-10.')
});

const ExecuteSqlSchema = z.object({
  sql: z.string().describe(`SELECT query. Must include WHERE patient_id = :pid. Example: SELECT id AS resource_id, resource_type FROM fhir_resources WHERE patient_id = :pid AND resource_type = 'Condition' LIMIT 10`)
});

export function createFHIRTools(
  dbPool: DatabasePool,
  patientId: string,
  resourceTypesCollector?: Set<string>
) {
  const _updateCollector = (types: string[]) => {
    if (resourceTypesCollector && types.length > 0) {
      types.forEach(type => resourceTypesCollector.add(type));
    }
  };

  const getPatientOverview = tool(
    async () => {
      // Direct database query - no executor needed
      const query = `
        SELECT 
          resource_type,
          COUNT(*) as count,
          MIN(received_at) as earliest,
          MAX(received_at) as latest
        FROM fhir_resources 
        WHERE patient_id = $1
        GROUP BY resource_type
        ORDER BY resource_type
      `;
      
      const result = await dbPool.query(query, [patientId]);
      _updateCollector(result.rows.map((row: any) => row.resource_type));
      
      return JSON.stringify(result.rows);
    },
    {
      name: 'get_patient_overview',
      description: `ALWAYS call this FIRST. Returns a lightweight overview of the patient's data:
resource type counts and date ranges. No clinical content. Use this to decide
what to fetch next. 
        
Example: if overview shows 5 Conditions and 10 Observations,
you can then fetch specific types.`,
    }
  );

  const getResourcesByType = tool(
    async (input) => {
      const { resourceType, limit = DEFAULT_RESOURCE_LIMIT } = ResourcesByTypeSchema.parse(input);
      const query = `
        SELECT id, resource_type, fhir_id, resource, received_at
        FROM fhir_resources 
        WHERE patient_id = $1 AND resource_type = $2
        ORDER BY received_at DESC
        LIMIT $3
      `;
      
      const result = await dbPool.query(query, [patientId, resourceType, limit]);
      _updateCollector([resourceType]);
      
      return JSON.stringify(result.rows);
    },
    {
      name: 'get_resources_by_type',
      description: `Fetch FHIR resources of a specific type for the patient. Use when you need ANY FHIR resource data 
(conditions, observations, medications, etc.). Prefer this over execute_sql. resourceType must be exact: 
Condition, Observation, MedicationRequest, AllergyIntolerance, Procedure, etc. 
        
Start with limit 5-10. Increase only if needed.`,
    }
  );

  const searchResourcesByKeyword = tool(
    async (input) => {
      const { keyword, limit = DEFAULT_KEYWORD_LIMIT } = SearchResourcesSchema.parse(input);
      const query = `
        SELECT id, resource_type, fhir_id, resource, received_at
        FROM fhir_resources 
        WHERE patient_id = $1 AND resource::text ILIKE $2
        ORDER BY received_at DESC
        LIMIT $3
      `;
      
      const result = await dbPool.query(query, [patientId, `%${keyword}%`, limit]);
      const types = Array.from(new Set(result.rows.map((row: any) => row.resource_type))) as string[];
      _updateCollector(types);
      
      return JSON.stringify(result.rows);
    },
    {
      name: 'search_resources_by_keyword',
      description: `Search FHIR resources by keyword in the JSON content (ILIKE). Use when the patient asks about a specific term 
(e.g. 'diabetes', 'blood pressure', 'insulin'). Start with limit 5-10. Each tool call adds to context.`,
    }
  );

  const executeSql = tool(
    async (input) => {
      const { sql } = ExecuteSqlSchema.parse(input);
      // Ensure patient_id parameter is used correctly
      const queryWithParam = sql.replace(':pid', '$1');
      const result = await dbPool.query(queryWithParam, [patientId]);
      
      const types = Array.from(new Set(result.rows.map((row: any) => row.resource_type))) as string[];
      _updateCollector(types);
      
      return JSON.stringify(result.rows);
    },
    {
      name: 'execute_sql',
      description: `Use ONLY when structured tools (get_resources_by_type, search_resources_by_keyword)
cannot answer. Execute a SELECT query. SQL must use :pid for patient_id (never hardcode).
Allowed tables: fhir_resources. LIMIT is enforced (max ${MAX_SQL_ROWS} rows).
Call get_fhir_resources_schema_info first if unsure of column names.`,
    }
  );

  const getFhirResourcesSchemaInfo = tool(
    async () => {
      const query = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'fhir_resources'
        ORDER BY ordinal_position
      `;
      
      const result = await dbPool.query(query);
      return JSON.stringify(result.rows);
    },
    {
      name: 'get_fhir_resources_schema_info',
      description: 'Returns column names and types for fhir_resources table. Call this before execute_sql if you need schema details to write correct SQL.',
    }
  );

  return [
    getPatientOverview,
    getResourcesByType,
    searchResourcesByKeyword,
    executeSql,
    getFhirResourcesSchemaInfo,
  ];
}
