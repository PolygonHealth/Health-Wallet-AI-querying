import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DatabasePool } from '../../../db/session';
import { FhirRepository } from './repository';
import { DEFAULT_KEYWORD_LIMIT, DEFAULT_RESOURCE_LIMIT, SQL_MAX_ROWS } from '../utils/constants';
import { logger } from '@/config/logging';

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
  resourceTypes: z.array(z.string()).describe(
    'Exact FHIR resource types, singular. E.g. ["Condition", "MedicationRequest", "Observation"]'
  ),
  limit: z.number().optional().default(DEFAULT_RESOURCE_LIMIT).describe(
    'Max resources per type. Start with 3-5. Increase only if needed.'
  ),
});

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
  sql: z.string().describe(
    `SELECT query using $1 for patient_id (pg positional params). ` +
    `Example: SELECT id AS resource_id, resource_type FROM fhir_resources WHERE patient_id = $1 AND resource_type = 'Condition' LIMIT 10`
  )
});

const FinishWithAnswerSchema = z.object({
  answer: z.string().describe(
    `Your complete response to the patient in markdown (headings, bullets, bold). No tables — use bullet or numbered lists. No citation numbers or source sections. Include a brief 'Polly's note' summarizing key points in plain language.

    DATA LINKING: 
    - When referencing any specific condition, medication, observation, procedure, encounter, or allergy, embed an inline markdown link so the user can navigate directly to that record.

    Link format: [Display Text](healthwallet://RESOURCE/EXACT_NAME)

    RESOURCE must be a valid FHIR resource type: Condition, Medication, Observation, etc.
    EXACT_NAME must exactly match the human-readable resource instance name as it appears in the patient data — this is typically found in code.text, but may also appear in code.coding[0].display, type[0].text, medicationCodeableConcept.text, or the resource's name field depending on resource type. 
    Use whichever field is populated. EXACT_NAME must be URL-encoded if it contains special characters.

    Rules:
    - Only link to records that exist in the patient data. Never fabricate links.
    - Embed links naturally within sentences, not grouped at the end.
    - Examples:
      - [Creatinine trend](healthwallet://observations/Creatinine%20%5BMass%2Fvolume%5D%20in%20Serum%20or%20Plasma)
      - [lisinopril details](healthwallet://medications/lisinopril%2010%20MG%20Oral%20Tablet)
      - [diabetes history](healthwallet://conditions/Diabetes)`
  ),
  resource_ids: z.array(z.string()).optional().describe(
    'UUIDs of FHIR resources cited inline in your answer.'
  )
});

export function createFHIRTools(
  dbPool: DatabasePool
) {
  const getPatientOverview = tool(
    async () => {
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
      schema: z.object({})
    }
  );

  const getResourcesByType = tool(
    async (input) => {
      const { resourceTypes, limit = DEFAULT_RESOURCE_LIMIT } = ResourcesByTypeSchema.parse(input);
      const repo = _fhirResourcesRepo(dbPool);

      // Fetch all types in parallel — one DB query per type, concurrent
      const results = await Promise.allSettled(
        resourceTypes.map(resourceType => repo.getResourcesByType(resourceType, limit))
      );

      const merged: any[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          const [json, , types] = result.value;
          _collect(types);
          const parsed = JSON.parse(json);
          if (parsed.resources) merged.push(...parsed.resources);
        } else {
          // One type failed — return error for that type but keep the rest
          logger.warn(`get_resources_by_type failed for ${resourceTypes[i]}: ${result.reason}`);
          merged.push({ error: `Failed to fetch ${resourceTypes[i]}: ${String(result.reason)}. 
            Try fetching ${resourceTypes[i]} individually.` });
        }
      }
      
      return JSON.stringify({ resources: merged, count: merged.length });
    },
    {
      name: 'get_resources_by_type',
      description: `Fetch FHIR resources for one or more resource types relevant to the user's question.
      
      Pass multiple types in one call when the question involves more than one resource type.
      E.g. for "what medications am I on and do I have any allergies?" pass ["MedicationRequest", "AllergyIntolerance"].
      
      Use when you know which resource types to fetch — either because the patient asked
      about them directly, or because 'get_patient_overview' confirmed they exist.
      
      Prefer this over 'execute_sql' for all standard resource type queries.
      
      Each type must be exact and singular: 'Condition', 'Observation',
      'MedicationRequest', 'AllergyIntolerance', 'Procedure', 'DiagnosticReport', etc.
      
      limit applies per type, not total.`,
      schema: ResourcesByTypeSchema,
    }
  );

  const searchResourcesByKeyword = tool(
    async (input) => {
      const { keyword, limit = DEFAULT_KEYWORD_LIMIT } = SearchResourcesSchema.parse(input);
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

      Prefer 'get_resources_by_type' when the resource type is already known.`,
      schema: SearchResourcesSchema
    }
  );

  const executeSql = tool(
    async (input) => {
      const { sql } = ExecuteSqlSchema.parse(input);
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
      Use $1 for patient_id (never hardcode). LIMIT is required (max ${SQL_MAX_ROWS}).

      resource is JSONB. Access fields using -> or ->> (NOT dot notation).
      When using jsonb_array_elements(), the alias is a JSON value, so use -> / ->>.

      EXAMPLES:
      SELECT id AS resource_id, p->'individual'->>'display'
      FROM fhir_resources, jsonb_array_elements(resource->'participant') AS p
      WHERE id = <uuid>

      SELECT query using $1 for patient_id. 
      Example: SELECT id AS resource_id, resource_type FROM fhir_resources 
      WHERE patient_id = $1 AND resource_type = 'Condition' LIMIT 10

      Incorrect: p.individual->>'display'`,
      schema: ExecuteSqlSchema
    }
  );

  const getFhirResourcesSchemaInfo = tool(
    async () => {
      const repo = _fhirResourcesRepo(dbPool);
      return await repo.getFhirResourcesSchemaInfo();
    },
    {
      name: 'get_fhir_resources_schema_info',
      description: 'Get the schema information for the fhir_resources table.',
      schema: z.object({})
    }
  );

  const finishWithAnswer = tool(
    async (input) => {
      const { answer, resource_ids } = FinishWithAnswerSchema.parse(input);
      const repo = _fhirResourcesRepo(dbPool);

      return repo.getFinalAnswer(answer, resource_ids || []);
    },
    {
      name: 'finish_with_answer',
      description: `You MUST always call this tool exactly once you have built enough context to answer patient's query fully.`,
      schema: FinishWithAnswerSchema
    }
  );

  return [
    getPatientOverview,
    getResourcesByType,
    searchResourcesByKeyword,
    executeSql,
    getFhirResourcesSchemaInfo,
    finishWithAnswer
  ];
}

