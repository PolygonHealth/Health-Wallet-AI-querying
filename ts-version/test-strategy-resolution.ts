// Simple test script to verify strategy resolution works
import { resolveStrategy } from './src/api/dependencies';
import { logger } from './src/config/logging';

async function testStrategyResolution() {
  try {
    logger.info('Testing strategy resolution...');
    
    const strategy = resolveStrategy('langgraph');
    logger.info(`Strategy resolved: ${strategy.name}`);
    logger.info('Strategy resolution test PASSED');
    
  } catch (error) {
    logger.error('Strategy resolution test FAILED:', error);
    process.exit(1);
  }
}

testStrategyResolution();
