import { createApp } from './api/app';
import { config } from './config/settings';
import { logger } from './config/logging';

async function startServer() {
  try {
    const app = createApp();
    const port = config.port;
    
    app.listen(port, () => {
      logger.info(`Server started on port ${port}`);
      logger.info(`API docs available at http://localhost:${port}/api-docs`);
      logger.info(`Health check at http://localhost:${port}/health`);
      logger.info(`Query endpoint at http://localhost:${port}/api/v1/query`);
      logger.info(`Benchmark endpoint at http://localhost:${port}/api/v1/benchmark`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();
