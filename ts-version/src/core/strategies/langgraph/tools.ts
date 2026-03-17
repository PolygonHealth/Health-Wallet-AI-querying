import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DatabasePool } from '../../../db/session';
import { FhirRepository } from './repository';
import { DEFAULT_KEYWORD_LIMIT, DEFAULT_RESOURCE_LIMIT, SQL_MAX_ROWS } from '../utils/constants';

// Context for resource type collection
let _patientId: string = '';
let _resourceTypesCollector: Set<string> = new Set();
export const RESOURCE_CATEGORIES = ['conditions', 'medications', 'encounters', 'procedures', 'observations', 'allergies'];
export function setRunContext(patientId: string, resourceTypesCollector: Set<string>) {
  _patientId = patientId;
  _resourceTypesCollector = resourceTypesCollector;
}

function _collect(types: string[]) {
  if (types && _resourceTypesCollector) {
    types.forEach(type => _resourceTypesCollector.add(type));
  }
}

function _fhirResourcesRepo(db: DatabasePool): FhirRepository {
  return new FhirRepository(db, _patientId);
}

// Zod schemas for tool inputs
const ResourcesByTypeSchema = z.object({
  resourceType: z.string().describe('Exact FHIR resource type, e.g. Condition, Observation, MedicationRequest. Not plural.'),
  limit: z.number().optional().default(DEFAULT_RESOURCE_LIMIT).describe('Max resources to return. Start with 5-10. Increase only if needed.')
}).passthrough();

const SearchResourcesSchema = z.object({
  keyword: z.string().describe('Search term, e.g. diabetes, hypertension, medication name.'),
  limit: z.number().optional().default(DEFAULT_KEYWORD_LIMIT).describe('Max resources to return. Start with 5-10.')
});
//
const ResourceDataLinksSchema = z.object({
  relevantResourceTypes: z.array(z.string()).describe(`Given the user's question, decide which health data categories are relevant.
 Available categories: ${RESOURCE_CATEGORIES.join(', ')}
 Rules:
 - Include ONLY relevant category names, e.g. ["medications","conditions"]
 - If the question is general or could involve multiple categories, include all relevant ones.
 - If unsure, include more rather than fewer.`)//'types of FHIR resources relevant to query, e.g. Condition, Observation, MedicationRequest`),
 
});
const ExecuteSqlSchema = z.object({
  sql: z.string().describe(`SELECT query using :pid for patient_id. Example: SELECT id AS resource_id, resource_type FROM fhir_resources WHERE patient_id = :pid AND resource_type = 'Condition' LIMIT 10`)
});

const FinishWithAnswerSchema = z.object({
  answer: z.string().describe('Your complete response to the patient in markdown (headings, bullets, bold). No tables — use bullet or numbered lists. No citation numbers or source sections. Include a brief \'Polly\'s note\' summarizing key points in plain language. When referencing patient data: use inline citations (Resource ID: <uuid>) for tracking.'),
  resource_ids: z.array(z.string()).optional().describe('Resource IDs you cited inline in your answer.')
});

export function createFHIRTools(
  dbPool: DatabasePool
) {
  const getPatientOverview = tool(
    async () => {
      /**
        Call this FIRST when the patient asks about health records, clinical data, or FHIR —
        and you don't yet know what data exists. Returns a lightweight summary of available resource types and date ranges.

        fhir_resources table columns: 
        - id (UUID PK)
        - patient_id (UUID)
        - resource_type (TEXT)
        - fhir_id (TEXT)
        - fhir_version (TEXT)
        - resource (JSONB)
        - received_at (TIMESTAMP)
        - kno2_request_ref (BOOLEAN)
        - has_document_text (BOOLEAN)
        
        Returns counts and date ranges. No clinical content.
      */
      const repo = _fhirResourcesRepo(dbPool);
      const [result, types] = await repo.getPatientOverview();
      _collect(types);
      return result;
    },
    {
      name: 'get_patient_overview',
      description: `Call this FIRST when the patient asks about health records, clinical data, or FHIR —
and you don't yet know what data exists. Returns a lightweight summary of available resource types and date ranges.

fhir_resources table columns: 
- id (UUID PK)
- patient_id (UUID)
- resource_type (TEXT)
- fhir_id (TEXT)
- fhir_version (TEXT)
- resource (JSONB)
- received_at (TIMESTAMP)
- kno2_request_ref (BOOLEAN)
- has_document_text (BOOLEAN)
        
Returns counts and date ranges. No clinical content.`,
      //schema: z.object({}) // ✅ No input parameters
    }
  );

  const getResourcesByType = tool(
    async (input) => {
      const { resourceType, limit = DEFAULT_RESOURCE_LIMIT } = ResourcesByTypeSchema.parse(input);
      /**
        Fetch FHIR resources of a specific type for the patient.

        Use when you know which resource type to fetch — either because the patient asked
        about it directly, or because get_patient_overview confirmed it exists.

        Prefer this over `execute_sql` for all standard resource type queries.

        resource_type must be exact and singular: Condition, Observation,
        MedicationRequest, AllergyIntolerance, Procedure, DiagnosticReport, etc.
      */
      const repo = _fhirResourcesRepo(dbPool);
      const [result, resourceIds, types] = await repo.getResourcesByType(resourceType, limit);
      _collect(types);
      return result;
    },
    {
      name: 'get_resources_by_type',
      description: `Fetch FHIR resources of a specific type for the patient. 
Use when you know which resource type to fetch — either because the patient asked
about it directly, or because get_patient_overview confirmed it exists.

Prefer this over execute_sql for all standard resource type queries.

resource_type must be exact and singular: Condition, Observation,
MedicationRequest, AllergyIntolerance, Procedure, DiagnosticReport, etc.`,
schema: ResourcesByTypeSchema,
    },
  );

  const searchResourcesByKeyword = tool(
    async (input) => {
      const { keyword, limit = DEFAULT_KEYWORD_LIMIT } = SearchResourcesSchema.parse(input);
      /**
        Search across all FHIR resources by keyword (case-insensitive JSON content match).

        Use when the patient asks about a specific condition, medication, or clinical term
        and you want any record mentioning it — regardless of resource type.

        Prefer get_resources_by_type when the resource type is already known.
      */
      const repo = _fhirResourcesRepo(dbPool);
      const [result, resourceIds, types] = await repo.getResourcesByKeyword(keyword, limit);
      _collect(types);
      return result;
    },
    {
      name: 'search_resources_by_keyword',
      description: `Search across all FHIR resources by keyword (case-insensitive JSON content match).

Use when the patient asks about a specific condition, medication, or clinical term
and you want any record mentioning it — regardless of resource type.

Prefer get_resources_by_type when the resource type is already known.`,
      schema: SearchResourcesSchema // ✅ Add schema
    }
  );

  const executeSql = tool(
    async (input) => {
      const { sql } = ExecuteSqlSchema.parse(input);
      /**
        Use ONLY if get_resources_by_type or search_resources_by_keyword cannot answer 
        (e.g. complex filtering, aggregation, joins). 
        Write a PostgreSQL SELECT query over the fhir_resources table only. 
        Use :pid for patient_id (never hardcode). LIMIT is required (max 50).

        resource is JSONB. Access fields using -> or ->> (NOT dot notation).
        When using jsonb_array_elements(), the alias is a JSON value, so use -> / ->>.

        EXAMPLES:
        SELECT id AS resource_id, p->'individual'->>'display'
        FROM fhir_resources, jsonb_array_elements(resource->'participant') AS p
        WHERE id = <uuid>

        SELECT query using :pid for patient_id. 
        Example: SELECT id AS resource_id, resource_type FROM fhir_resources 
        WHERE patient_id = :pid AND resource_type = 'Condition' LIMIT 10

        Incorrect: p.individual->>'display'
      */
      const repo = _fhirResourcesRepo(dbPool);
      const [result, resourceIds, types] = await repo.getResourcesByRawSQL(sql);
      _collect(types);
      return result;
    },
    {
      name: 'execute_sql',
      description: `Use ONLY if get_resources_by_type or search_resources_by_keyword cannot answer 
(e.g. complex filtering, aggregation, joins). 
Write a PostgreSQL SELECT query over the fhir_resources table only. 
Use :pid for patient_id (never hardcode). LIMIT is required (max ${SQL_MAX_ROWS}).

resource is JSONB. Access fields using -> or ->> (NOT dot notation).
When using jsonb_array_elements(), the alias is a JSON value, so use -> / ->>.

EXAMPLES:
SELECT id AS resource_id, p->'individual'->>'display'
FROM fhir_resources, jsonb_array_elements(resource->'participant') AS p
WHERE id = <uuid>

SELECT query using :pid for patient_id. 
Example: SELECT id AS resource_id, resource_type FROM fhir_resources 
WHERE patient_id = :pid AND resource_type = 'Condition' LIMIT 10

Incorrect: p.individual->>'display'`,
      schema: ExecuteSqlSchema // ✅ Add schema
    }
  );

  const getFhirResourcesSchemaInfo = tool(
    async () => {
      /**
        Get the schema information for the fhir_resources table.
      */
      const repo = _fhirResourcesRepo(dbPool);
      return await repo.getFhirResourcesSchemaInfo();
    },
    {
      name: 'get_fhir_resources_schema_info',
      description: 'Get the schema information for the fhir_resources table.',
      schema: z.object({}) // ✅ No input parameters
    }
  );

  const finishWithAnswer = tool(
    async (input) => {
      const { answer, resource_ids } = FinishWithAnswerSchema.parse(input);
      /**
        Always call last. For FHIR questions: cite inline as (Resource ID: <uuid>). Never return text without calling this.
      */
      const repo = _fhirResourcesRepo(dbPool);
      return repo.getFinalAnswer(answer, resource_ids || []);
    },
    {
      name: 'finish_with_answer',
      description: 'Always call last. For FHIR questions: cite inline as (Resource ID: <uuid>). Never return text without calling this.',
      schema: FinishWithAnswerSchema // ✅ Add schema
    }
  );

// async function routeQuery(prompt) {
  
//   try {
//     const routerPrompt = `You are a query classifier for a patient health data system.
// Given the user's question, decide which health data categories are relevant.
// Available categories: ${RESOURCE_CATEGORIES.join(', ')}

// Rules:
// - Return ONLY a JSON array of relevant category names, e.g. ["medications","conditions"]
// - If the question is general or could involve multiple categories, include all relevant ones.
// - If unsure, include more rather than fewer.
// - Return ONLY the JSON array, no other text.

// User question: "${prompt}"`;

//     const response = await ai.models.generateContent({
//       model: 'gemini-3-flash-preview',
//       contents: routerPrompt,
//     });

//     const text = (typeof response.text === 'function' ? response.text() : response.text).trim();
//     const parsed = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
//     const valid = parsed.filter(c => RESOURCE_CATEGORIES.includes(c));
//     console.log('[HealthWallet Router] Query:', prompt.substring(0, 80));
//     console.log('[HealthWallet Router] Relevant categories:', valid);
//     return valid.length > 0 ? valid : RESOURCE_CATEGORIES;
//   } catch (err) {
//     console.warn('[HealthWallet Router] Classification failed, using all categories:', err.message);
//     return RESOURCE_CATEGORIES;
//   }
// }

const extractReferecesToResourceData = tool(
    async (input) => {
      const { keyword, limit = DEFAULT_KEYWORD_LIMIT } = SearchResourcesSchema.parse(input);
      /**
        Search across all FHIR resources by keyword (case-insensitive JSON content match).

        Use when the patient asks about a specific condition, medication, or clinical term
        and you want any record mentioning it — regardless of resource type.

        Prefer get_resources_by_type when the resource type is already known.
      */
      const repo = _fhirResourcesRepo(dbPool);
      const [result, resourceIds, types] = await repo.getResourcesByKeyword(keyword, limit);
      _collect(types);
      return result;
    },
    {
      name: 'get_relevant_values_from_relevant_resource',
      description: `Call this function to get links for names of medications, conditions etc that UI can render.  Aggregates names across FHIR resources relevant to the query.  Creates links used by the UI to display.
      Use when the patient asks about a specific condition, medication, or clinical term and you want any record mentioning it — regardless of resource type.
Refer get_resources_by_type when the resource type is already known.`,
      schema: ResourceDataLinksSchema // ✅ Add schema
    }
  );

  return [
    getPatientOverview,
    getResourcesByType,
    searchResourcesByKeyword,
    executeSql,
    getFhirResourcesSchemaInfo,
    finishWithAnswer,
    extractReferecesToResourceData
  ];
}

