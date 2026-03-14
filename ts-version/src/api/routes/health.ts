import { Router, Request, Response } from 'express';
import { getDbPool } from '../../db/session';
import { logger } from '../../config/logging';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     HealthResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [healthy, unhealthy]
 *           description: The health status of the service
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: ISO timestamp of the health check
 *         uptime:
 *           type: number
 *           description: Server uptime in seconds
 *         memory:
 *           type: object
 *           description: Memory usage statistics
 *         database:
 *           type: string
 *           enum: [connected, disconnected]
 *           description: Database connection status
 * 
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [unhealthy, not ready]
 *         timestamp:
 *           type: string
 *           format: date-time
 *         error:
 *           type: string
 *           description: Error message if health check fails
 *         database:
 *           type: string
 *           enum: [disconnected]
 */

/**
 * @swagger
 * /api/fhir/health:
 *   get:
 *     summary: Check service health
 *     description: Returns the health status of the service including database connectivity
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @swagger
 * /api/fhir/health/ready:
 *   get:
 *     summary: Check if service is ready to handle requests
 *     description: Returns readiness status including database connectivity
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ready, not ready]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: Service is not ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @swagger
 * /api/fhir/health/live:
 *   get:
 *     summary: Check if service is alive
 *     description: Simple liveness check that always returns success if the process is running
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [alive]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: Server uptime in seconds
 */
router.get('/health/live', (req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export { router as healthRouter };
