export interface DatabasePool {
    query(text: string, params?: any[]): Promise<any>;
    end(): Promise<void>;
}
export declare function getAllFHIRByPatient(db: DatabasePool, patientId: string): Promise<any[]>;
export declare function getPatientOverview(db: DatabasePool, patientId: string): Promise<any>;
export declare function getFHIRByType(db: DatabasePool, patientId: string, resourceType: string, limit?: number): Promise<any[]>;
export declare function searchResourcesByKeyword(db: DatabasePool, patientId: string, keyword: string, limit?: number): Promise<any[]>;
export declare function executeRawSQL(db: DatabasePool, sql: string, params: any): Promise<any[]>;
export declare function getFHIRResourcesSchemaInfo(db: DatabasePool): Promise<any>;
//# sourceMappingURL=queries.d.ts.map