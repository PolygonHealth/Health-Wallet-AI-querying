import winston from 'winston';
import { config } from './settings';

const format = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

export const logger = winston.createLogger({
  level: config.logLevel,
  format,
  transports: [
    new winston.transports.Console(),
  ],
});

export const setupLogging = (level: string) => {
  logger.level = level;
  logger.info(`Logging set to ${level} level`);
};
