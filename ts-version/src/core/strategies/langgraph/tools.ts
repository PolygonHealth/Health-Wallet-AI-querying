import { tool } from '@langchain/core/tools';
import { DatabasePool } from '../../../db/session';
import { ToolExecutor } from '../utils/tool-executor';
import { DEFAULT_KEYWORD_LIMIT, DEFAULT_RESOURCE_LIMIT, MAX_SQL_ROWS } from '../utils/constants';

export function createFHIRTools(
  dbPool: DatabasePool,
  patientId: string,
  resourceTypesCollector?: Set<string>
) {
  const executor = new ToolExecutor(dbPool, patientId);

  const getPatientOverview = tool(
    async () => {
      const result = await executor.execute('get_patient_overview', {});
      return result;
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
    async ({ resourceType, limit = DEFAULT_RESOURCE_LIMIT }: { resourceType: string; limit?: number }) => {
      const result = await executor.execute('get_resources_by_type', { resourceType, limit });
      return result;
    },
    {
      name: 'get_resources_by_type',
      description: `Fetch FHIR resources of a specific type for the patient. Use when you need ANY FHIR resource data 
(conditions, observations, medications, etc.). Prefer this over execute_sql. resourceType must be exact: 
Condition, Observation, MedicationRequest, AllergyIntolerance, Procedure, etc. 
        
Start with limit 5-10. Increase only if needed.`,
      schema: {
        resourceType: {
          type: 'string',
          description: 'Exact FHIR resource type, e.g. Condition, Observation, MedicationRequest. Not plural.',
        },
        limit: {
          type: 'number',
          description: 'Max resources to return. Start with 5-10. Increase only if needed.',
          default: DEFAULT_RESOURCE_LIMIT,
        },
      },
    }
  );

  const searchResourcesByKeyword = tool(
    async ({ keyword, limit = DEFAULT_KEYWORD_LIMIT }: { keyword: string; limit?: number }) => {
      const result = await executor.execute('search_resources_by_keyword', { keyword, limit });
      return result;
    },
    {
      name: 'search_resources_by_keyword',
      description: `Search FHIR resources by keyword in the JSON content (ILIKE). Use when the patient asks about a specific term 
(e.g. 'diabetes', 'blood pressure', 'insulin'). Start with limit 5-10. Each tool call adds to context.`,
      schema: {
        keyword: {
          type: 'string',
          description: 'Search term, e.g. diabetes, hypertension, medication name.',
        },
        limit: {
          type: 'number',
          description: 'Max resources to return. Start with 5-10.',
          default: DEFAULT_KEYWORD_LIMIT,
        },
      },
    }
  );

  const executeSql = tool(
    async ({ sql }: { sql: string }) => {
      const result = await executor.execute('execute_sql', { sql });
      return result;
    },
    {
      name: 'execute_sql',
      description: `Use ONLY when structured tools (get_resources_by_type, search_resources_by_keyword)
cannot answer. Execute a SELECT query. SQL must use :pid for patient_id (never hardcode).
Allowed tables: fhir_resources. LIMIT is enforced (max ${MAX_SQL_ROWS} rows).
Call get_fhir_resources_schema_info first if unsure of column names.`,
      schema: {
        sql: {
          type: 'string',
          description: `SELECT query. Must include WHERE patient_id = :pid. Example: SELECT id AS resource_id, resource_type 
FROM fhir_resources WHERE patient_id = :pid AND resource_type = 'Condition' LIMIT 10`,
        },
      },
    }
  );

  const getFhirResourcesSchemaInfo = tool(
    async () => {
      const result = await executor.execute('get_fhir_resources_schema_info', {});
      return result;
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
