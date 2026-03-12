import { Pool, PoolConfig } from 'pg';
import { config } from '../config/settings';
import { logger } from '../config/logging';

export interface DatabasePool {
  query(text: string, params?: any[]): Promise<any>;
  end(): Promise<void>;
}

class PostgreSQLPool implements DatabasePool {
  private pool: Pool;

  constructor() {
    const poolConfig: PoolConfig = {
      connectionString: config.databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    this.pool = new Pool(poolConfig);

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  async query(text: string, params?: any[]) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Query failed', { text, duration, error });
      throw error;
    }
  }

  async end() {
    await this.pool.end();
  }
}

// Singleton instance
let dbPool: DatabasePool | null = null;

export function getDbPool(): DatabasePool {
  if (!dbPool) {
    dbPool = new PostgreSQLPool();
  }
  return dbPool;
}

export async function closeDbPool(): Promise<void> {
  if (dbPool) {
    await dbPool.end();
    dbPool = null;
  }
}
