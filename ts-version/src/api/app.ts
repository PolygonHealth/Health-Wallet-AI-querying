import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '../config/settings';
import { logger, setupLogging } from '../config/logging';
import { queryRouter } from './routes/query';
import { healthRouter } from './routes/health';
import { benchmarkRouter } from './routes/benchmark';

export function createApp(): express.Application {
  setupLogging(config.logLevel);
  
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    next();
  });

  // Routes
  app.use('/api/v1', queryRouter);
  app.use('/api/v1', benchmarkRouter);
  app.use('/', healthRouter);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      service: 'Polygon Health AI Query Engine - TypeScript',
      status: 'running',
      docs: '/api-docs',
      health: '/health',
      version: '0.1.0',
    });
  });

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      error: 'Internal server error',
      message: config.logLevel === 'debug' ? err.message : undefined,
    });
  });

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not found',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    });
  });

  return app;
}
