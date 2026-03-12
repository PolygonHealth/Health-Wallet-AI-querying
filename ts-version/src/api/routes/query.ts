import { Router, Request, Response } from 'express';
import { QueryRequestSchema, QueryResponseSchema } from '../../core/models';
import { resolveStrategy } from '../dependencies';
import { logger } from '../../config/logging';

const router = Router();

router.post('/query', async (req: Request, res: Response) => {
  try {
    // Validate request
    const validatedQuery = QueryRequestSchema.parse(req.body);
    
    const strategyName = validatedQuery.strategy || 'langgraph';
    const modelName = validatedQuery.model || 'gemini-3.0-flash';
    
    logger.info('Processing query', {
      patientId: validatedQuery.patientId,
      strategy: strategyName,
      model: modelName,
      queryLength: validatedQuery.query.length,
    });

    // Resolve strategy
    const strategy = resolveStrategy(strategyName);
    
    // Execute query
    const context = {
      patientId: validatedQuery.patientId,
      queryText: validatedQuery.query,
      strategyName,
      modelName,
      maxTokens: 4000,
      temperature: 0.1,
    };

    const result = await strategy.execute(context);
    
    // Format response
    const response = QueryResponseSchema.parse({
      response: result.responseText,
      resourceIds: result.resourceIds,
      modelUsed: result.modelUsed,
      strategyUsed: result.strategyUsed,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
      error: result.error,
    });

    logger.info('Query completed', {
      patientId: validatedQuery.patientId,
      strategy: strategyName,
      latencyMs: result.latencyMs,
      resourceCount: result.resourceIds.length,
      hasError: !!result.error,
    });

    res.json(response);
  } catch (error) {
    logger.error('Query failed', { error: error instanceof Error ? error.message : String(error) });
    
    if (error instanceof Error && error.message.includes('validation')) {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Query processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as queryRouter };
