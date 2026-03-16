import { Pool, PoolConfig } from 'pg';
import { config } from '../config/settings';
import { logger } from '../config/logging';

export interface DatabasePool {
  query(text: string, params?: any[]): Promise<any>;
  end(): Promise<void>;
}

class PostgreSQLPool implements DatabasePool {
  private pool: Pool;
  private connected: boolean = false;

  constructor() {
    const poolConfig: PoolConfig = {
      // ✅ Use separate connection keys like admin server
      host: 'database-1.ck8q5kci5t8d.us-east-2.rds.amazonaws.com',
      user: 'polygon_map',
      password: 'polygon!',
      database: 'copy2',
      port: 5432,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: {
        rejectUnauthorized: false // ✅ Match admin server SSL config
      }
    };

    this.pool = new Pool(poolConfig);

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  async ensureConnected() {
    if (!this.connected) {
      try {
        const client = await this.pool.connect();
        client.release();
        this.connected = true;
        logger.info('Database pool connected successfully');
      } catch (error) {
        logger.error('Failed to connect to database', error);
        throw error;
      }
    }
  }

  async query(text: string, params?: any[]) {
    await this.ensureConnected(); // ✅ Ensure connection before query
    
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
