export interface DatabasePool {
    query(text: string, params?: any[]): Promise<any>;
    end(): Promise<void>;
}
export declare function getDbPool(): DatabasePool;
export declare function closeDbPool(): Promise<void>;
//# sourceMappingURL=session.d.ts.map