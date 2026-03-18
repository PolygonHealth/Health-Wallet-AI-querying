// FhirRepository — typed data-access layer for FHIR queries.
//
// Replaces ToolExecutor's string-keyed _dispatch() with real method calls.
// Tools import this and call typed methods directly; no string routing.

import { logger } from '../../../config/logging';
import { DatabasePool } from '../../../db/session';
import {
  getAllFHIRByPatient,
  getPatientOverview,
  getFHIRByType,
  searchResourcesByKeyword,
  executeRawSQL,
  getFHIRResourcesSchemaInfo,
  getFHIRUISummaryDataByPatientId
} from '../../../db/queries';
import {
  DEFAULT_KEYWORD_LIMIT,
  DEFAULT_RESOURCE_LIMIT,
  MAX_SINGLE_TOOL_CHARS
} from '../utils/constants';
import { validateSQL, SQLValidationError } from '../utils/sql_guard';
import { RESOURCE_CATEGORIES } from './tools';
import { descopeInlineReferences } from '../utils/descope_ui_link';

const TRUNCATION_MESSAGE = 'Result truncated. Use more specific filters to reduce result size.';

function truncate(data: any, toolName: string): string {
  /**Serialize and truncate if over MAX_SINGLE_TOOL_CHARS.*/
  const jsonStr = JSON.stringify(data, (key, value) =>
    value instanceof Date ? value.toISOString() : value
  );

  if (jsonStr.length <= MAX_SINGLE_TOOL_CHARS) {
    return jsonStr;
  }

  logger.warn(
    `tool_result_truncated | tool=${toolName} | size=${jsonStr.length} | cap=${MAX_SINGLE_TOOL_CHARS}`
  );

  return JSON.stringify({
    truncated: true,
    message: TRUNCATION_MESSAGE,
    chars_returned: MAX_SINGLE_TOOL_CHARS,
    total_chars: jsonStr.length,
  }, (key, value) =>
    value instanceof Date ? value.toISOString() : value
  );
}

export class FhirRepository {
  /**Typed FHIR data-access methods. One instance per tool invocation (holds db + patient_id).*/

  constructor(
    private db: DatabasePool,
    private patient_id: string
  ) { }

  async getPatientOverview(): Promise<[string, string[]]> {
    /**Returns (json_result, resource_types).*/
    try {
      const data = await getPatientOverview(this.db, this.patient_id);
      const types = (data.by_type || []).map((row: any) => row.resource_type);
      return [truncate(data, 'get_patient_overview'), types];
    } catch (error) {
      logger.error(
        `repo_error | method=get_patient_overview | patient_id=${this.patient_id} | error=${String(error)}`
      );
      throw new Error(`Failed to get patient overview for patient ${this.patient_id}: ${String(error)}`);
    }
  }

  async getResourcesByType(
    resource_type: string,
    limit: number = DEFAULT_RESOURCE_LIMIT
  ): Promise<[string, string[], string[]]> {
    /**Returns (json_result, resource_ids, resource_types).*/
    try {
      const rows = await getFHIRByType(this.db, this.patient_id, resource_type, limit);
      const ids = rows.map((r: any) => r.resource_id);
      const types = resource_type && rows.length > 0 ? [resource_type] : [];

      return [
        truncate({ resources: rows, count: rows.length }, 'get_resources_by_type'),
        ids,
        types,
      ];
    } catch (error) {
      logger.error(
        `repo_error | method=get_resources_by_type | patient_id=${this.patient_id} | type=${resource_type} | error=${String(error)}`
      );
      return [JSON.stringify({ error: String(error) }), [], []];
    }
  }

  async getResourcesByKeyword(
    keyword: string,
    limit: number = DEFAULT_KEYWORD_LIMIT
  ): Promise<[string, string[], string[]]> {
    /**Returns (json_result, resource_ids, resource_types).*/
    try {
      const rows = await searchResourcesByKeyword(this.db, this.patient_id, keyword, limit);
      const ids = rows.map((r: any) => r.resource_id);
      const types = [...new Set(rows.map((r: any) => r.resource_type).filter(Boolean))];

      return [
        truncate({ resources: rows, count: rows.length }, 'get_resources_by_keyword'),
        ids,
        types,
      ];
    } catch (error) {
      logger.error(
        `repo_error | method=get_resources_by_keyword | patient_id=${this.patient_id} | keyword=${keyword} | error=${String(error)}`
      );
      return [JSON.stringify({ error: String(error) }), [], []];
    }
  }

  async getResourcesByRawSQL(sql: string): Promise<[string, string[], string[]]> {
    /**Returns (json_result, resource_ids, resource_types). Validates SQL first.*/
    try {
      sql = validateSQL(sql);
    } catch (error) {
      if (error instanceof SQLValidationError) {
        return [JSON.stringify({ error: error.message }), [], []];
      }
      throw error;
    }

    try {
      const rows = await executeRawSQL(this.db, sql, [this.patient_id]);
      const ids = rows
        .map((r: any) => String(r.resource_id || r.id))
        .filter(Boolean);
      const types = [...new Set(rows.map((r: any) => r.resource_type).filter(Boolean))];

      return [
        truncate({ rows, count: rows.length }, 'get_resources_by_raw_sql'),
        ids,
        types,
      ];
    } catch (error) {
      logger.error(
        `repo_error | method=get_resources_by_raw_sql | patient_id=${this.patient_id} | error=${String(error)}`
      );
      return [JSON.stringify({ error: String(error) }), [], []];
    }
  }

  async getFhirResourcesSchemaInfo(): Promise<string> {
    /**Returns JSON schema description of fhir_resources table.*/
    try {
      const data = await getFHIRResourcesSchemaInfo(this.db);
      return JSON.stringify(data, (key, value) =>
        value instanceof Date ? value.toISOString() : value
      );
    } catch (error) {
      logger.error(
        `repo_error | method=get_fhir_resources_schema_info | patient_id=${this.patient_id} | error=${String(error)}`
      );
      throw error;
    }
  }

  getFinalAnswer(answer: string, resource_ids: string[]): string {
    /**Package the final answer as a JSON string for ToolMessage content.*/
    answer = descopeInlineReferences(answer);
    return JSON.stringify({
      answer,
      resource_ids: [...new Set(resource_ids)], // Deduplicate
      resource_types: [],
    }, (key, value) =>
      value instanceof Date ? value.toISOString() : value
    );
  }

  // async getFHIRUISummaryDataByPatientId(): Promise<string> {
  //   try {
  //     const data = await getFHIRUISummaryDataByPatientId(this.db, this.patient_id);
  //     return JSON.stringify(data, (key, value) =>
  //       value instanceof Date ? value.toISOString() : value
  //     );
  //   } catch (error) {
  //     logger.error('repo_error | method=getFHIRUISummaryDataByPatientId | error=%s', error);
  //     throw error;
  //   }
  // }


  // --- Build context: full details for relevant categories, summaries for others ---
  async buildContextForLinks(relevantCategories: string[]) {
    try {
      const fhirData = await getFHIRUISummaryDataByPatientId(this.db, this.patient_id);
      const context: any = {
        patient: {
          name: fhirData.name,
          gender: fhirData.gender,
          birth_date: fhirData.birth_date,
          patient_id: fhirData.patient_id,
        },
      };

      for (const cat of RESOURCE_CATEGORIES) {
        const data = fhirData[cat] || [];
        if (relevantCategories.includes(cat)) {
          // Full data with details for relevant categories
          context[cat] = data.map((item: any) => ({
            name: item.name,
          }));
        } else {
          // Lightweight summaries for non-relevant categories
          context[cat + '_summary'] = data.map((item: any) => ({
            name: item.name,
            start: item.start,
            ...(item.status && { status: item.status }),
          }));
        }
      }

      return { context };
    } catch (error) {
      logger.error('repo_error | method=buildContextForLinks | error=%s', error);
      throw error;
    }
  }


}

//getFHIRUISummaryDataByPatientId
