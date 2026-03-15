import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { config } from '../config/settings';
import { logger, setupLogging } from '../config/logging';
import { queryRouter } from './routes/query';
import { queryStreamRouter } from './routes/query-stream';
import { healthRouter } from './routes/health';
import { benchmarkRouter } from './routes/benchmark';

export function createApp(): express.Application {
  setupLogging(config.LOG_LEVEL);
  
  const app = express();

  // Swagger configuration
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Polygon Health AI Query Engine - TypeScript',
        version: '0.1.0',
        description: 'AI-powered health data query engine using LangGraph and FHIR',
        contact: {
          name: 'Polygon Health',
          email: 'support@polygon.health',
        },
      },
      servers: [
        {
          url: `http://localhost:${config.PORT}`,
          description: 'Development server',
        },
      ],
      tags: [
        {
          name: 'Health',
          description: 'Service health and status endpoints',
        },
        {
          name: 'Query',
          description: 'AI-powered health query processing',
        },
        {
          name: 'Benchmark',
          description: 'Performance benchmarking tools',
        },
      ],
    },
    apis: ['./src/api/routes/*.ts'], // Path to the API docs
  };

  const swaggerSpec = swaggerJsdoc(swaggerOptions);

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

  // Swagger documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Polygon Health AI Query Engine API Docs',
  }));

  // Swagger JSON specification
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Routes
  app.use('/api/fhir', queryRouter);
  app.use('/api/fhir', queryStreamRouter);
  app.use('/api/v1', benchmarkRouter);
  app.use('/api/fhir', healthRouter);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      service: 'Polygon Health AI Query Engine - TypeScript',
      status: 'running',
      health: '/api/fhir/health',
      query: '/api/fhir/query',
      queryStream: '/api/fhir/query-stream',
      benchmark: '/api/v1/benchmark',
      docs: '/api-docs',
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
      message: config.LOG_LEVEL === 'debug' ? err.message : undefined,
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
