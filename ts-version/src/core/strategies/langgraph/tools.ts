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
  sql: z.string().describe(
    `SELECT query using $1 for patient_id (pg positional params). ` +
    `Example: SELECT id AS resource_id, resource_type FROM fhir_resources WHERE patient_id = $1 AND resource_type = 'Condition' LIMIT 10`
  )
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
      const { resourceType, limit = DEFAULT_RESOURCE_LIMIT } = ResourcesByTypeSchema.parse(input);
      const repo = _fhirResourcesRepo(dbPool);
      const [result, resourceIds, types] = await repo.getResourcesByType(resourceType, limit);
      _collect(types);
      return result;
    },
    {
      name: 'get_resources_by_type',
      description: `Fetch FHIR resources of a specific type for the patient. 
      Use when you know which resource type to fetch — either because the patient asked
      about it directly, or because 'get_patient_overview' confirmed it exists.

      Prefer this over 'execute_sql' for all standard resource type queries.

      resource_type must be exact and singular: Condition, Observation,
      MedicationRequest, AllergyIntolerance, Procedure, DiagnosticReport, etc.`,
      schema: ResourcesByTypeSchema,
    },
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
      description: 'Always call last. For FHIR questions: cite inline as (Resource ID: <uuid>). Never return text without calling this.',
      schema: FinishWithAnswerSchema
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
      const {relevantResourceTypes } = ResourceDataLinksSchema.parse(input);
      /**
        Search across all FHIR resources by keyword (case-insensitive JSON content match).

        Use when the patient asks about a specific condition, medication, or clinical term
        and you want any record mentioning it — regardless of resource type.

        Prefer get_resources_by_type when the resource type is already known.
      */
      const repo = _fhirResourcesRepo(dbPool);
      const { context } = await repo.buildContextForLinks(relevantResourceTypes);
   const contextJson = JSON.stringify(context);
const fullPrompt = `
      TASK:
      You are a friendly, warm, and slightly witty medical assistant chatbot named "Polly" for a patient-centric health wallet.
      You have two sources of information:
      1. The patient's personal health data provided below (loaded with full detail for: ${relevantResourceTypes.join(', ')}).
      2. Google Search, which you should actively use to look up drug comparisons, treatment options, medical terminology, latest clinical guidelines, or any question that goes beyond the patient's raw data.

      PERSONALITY:
      - Be personable and warm — like a knowledgeable friend who happens to have medical expertise.
      - Use a light touch of humor where appropriate (e.g., "Your records show you're on lisinopril — a classic choice, very popular at the blood-pressure-lowering party!").
      - But always stay professional on serious topics — never joke about diagnoses, prognoses, or patient fears.
      - Use the patient's name occasionally to make it feel personal.
      - Keep things conversational, not clinical. Say "looks like" instead of "records indicate," etc.

      INSTRUCTIONS:
      - First, use the patient's health data to understand their situation.
      - Always clearly distinguish between information from the patient's records vs. information from web sources.
      - Do not invent medical advice. Recommend consulting a healthcare provider for personalized decisions.
      - Add a "Polly's note" to summarize each aspect of the output in your own words that the patient can undertand easily
      - Format your response in markdown (headings, bullet points, bold text as appropriate).
      - NEVER use markdown tables. Use bullet points or numbered lists instead.
      - DO NOT add your own citation numbers, source links, reference lists, or footnotes in your response. Citations are handled automatically by the system. Just write your answer naturally without any [1], [2], (source), or "Sources:" sections.

      DATE AWARENESS:
      - Today's date is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
      - When discussing the patient's health, give more weight to recent data. Older records are useful for context and trends, but the patient's current situation is best reflected by the most recent entries.
      - If the user asks about their "current" status without specifying a date, focus primarily on the most recent data points.
      - When referencing data, mention how recent or old it is (e.g., "as of your last reading in March 2024" or "back in 2019").
      - If data is significantly outdated (e.g., several years old), note that and suggest the patient may want to get updated tests or check-ups.

      WEB SEARCH — WHEN AND HOW:
      - You MUST use Google Search for any of these scenarios:
        1. The user asks about medications (side effects, alternatives, interactions, dosage, comparisons).
        2. The user asks about a condition (prognosis, treatment options, lifestyle recommendations, what it means).
        3. The user asks about lab values or observations (what is a normal range, what does high/low mean, clinical significance).
        4. The user asks about procedures (what to expect, recovery, risks).
        5. Any question that requires medical knowledge beyond what is in the raw patient data.
        6. Any question about latest guidelines, research, or general health advice.
      - When the query is purely about what data exists in the patient's records (e.g., "list my medications", "when was my last visit"), you can answer from the data alone without searching.
      - When in doubt, SEARCH. It is better to ground your answer with real sources than to rely on your training data alone.

      DATA LINKING:
      - When you reference specific patient data (a condition, medication, observation, etc.), create an inline link so the user can view that data directly.
      - Use this exact markdown link format: [Display Text](healthwallet://RESOURCE/EXACT_NAME)
      - RESOURCE must be one of: conditions, medications, encounters, procedures, observations, allergies
      - EXACT_NAME must match exactly as it appears in the patient data context (case-sensitive, URL-encoded if it contains special characters).
      - Examples:
        - [View Creatinine trend](healthwallet://observations/Creatinine%20%5BMass%2Fvolume%5D%20in%20Serum%20or%20Plasma)
        - [lisinopril details](healthwallet://medications/lisinopril%2010%20MG%20Oral%20Tablet)
        - [diabetes history](healthwallet://conditions/Diabetes)
      - Only link to data that actually exists in the patient context. Do not fabricate links.
      - Use these links naturally within sentences — do NOT group them all at the end.`+

      // PATIENT_PROMPT:
      // ${prompt}

      `PATIENT_HEALTH_DATA_CONTEXT:
      ${contextJson}
      `;
      //_collect(types);
      return contextJson//result;
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

