import { Router, Request, Response } from 'express';
import { getDbPool } from '../../db/session';
import { logger } from '../../config/logging';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  try {
    const dbPool = getDbPool();
    
    // Test database connectivity
    await dbPool.query('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: 'connected',
    });
  } catch (error) {
    logger.error('Health check failed', { error: error instanceof Error ? error.message : String(error) });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      database: 'disconnected',
    });
  }
});

// Additional health endpoints
router.get('/health/ready', async (req: Request, res: Response) => {
  try {
    const dbPool = getDbPool();
    await dbPool.query('SELECT 1');
    
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/health/live', (req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export { router as healthRouter };
