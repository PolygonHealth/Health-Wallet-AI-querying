"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbPool = getDbPool;
exports.closeDbPool = closeDbPool;
const pg_1 = require("pg");
const settings_1 = require("../config/settings");
const logging_1 = require("../config/logging");
class PostgreSQLPool {
    constructor() {
        const poolConfig = {
            connectionString: settings_1.config.databaseUrl,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        };
        this.pool = new pg_1.Pool(poolConfig);
        this.pool.on('error', (err) => {
            logging_1.logger.error('Unexpected error on idle client', err);
        });
    }
    async query(text, params) {
        const start = Date.now();
        try {
            const res = await this.pool.query(text, params);
            const duration = Date.now() - start;
            logging_1.logger.debug('Executed query', { text, duration, rows: res.rowCount });
            return res;
        }
        catch (error) {
            const duration = Date.now() - start;
            logging_1.logger.error('Query failed', { text, duration, error });
            throw error;
        }
    }
    async end() {
        await this.pool.end();
    }
}
// Singleton instance
let dbPool = null;
function getDbPool() {
    if (!dbPool) {
        dbPool = new PostgreSQLPool();
    }
    return dbPool;
}
async function closeDbPool() {
    if (dbPool) {
        await dbPool.end();
        dbPool = null;
    }
}
//# sourceMappingURL=session.js.map