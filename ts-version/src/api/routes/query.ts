import { Router, Request, Response } from 'express';
import { QueryRequestSchema, QueryResponseSchema } from '../../core/models';
import { resolveStrategy } from '../dependencies';
import { logger } from '../../config/logging';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     QueryRequest:
 *       type: object
 *       required:
 *         - patientId
 *         - query
 *       properties:
 *         patientId:
 *           type: string
 *           description: Patient ID for the query
 *           example: "patient-123"
 *         query:
 *           type: string
 *           description: Natural language health query
 *           example: "What medications is this patient taking?"
 *         strategy:
 *           type: string
 *           enum: [langgraph]
 *           description: AI strategy to use for processing
 *           default: "langgraph"
 *         model:
 *           type: string
 *           description: AI model to use
 *           default: "gemini-3.0-flash"
 *     
 *     QueryResponse:
 *       type: object
 *       properties:
 *         response:
 *           type: string
 *           description: AI-generated response to the query
 *         resourceIds:
 *           type: array
 *           items:
 *             type: string
 *           description: List of FHIR resource IDs referenced in the response
 *         modelUsed:
 *           type: string
 *           description: The AI model that was used
 *         strategyUsed:
 *           type: string
 *           description: The strategy that was used
 *         tokensIn:
 *           type: number
 *           description: Number of input tokens used
 *         tokensOut:
 *           type: number
 *           description: Number of output tokens generated
 *         latencyMs:
 *           type: number
 *           description: Processing latency in milliseconds
 *         error:
 *           type: string
 *           description: Error message if processing failed
 *     
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Error type
 *         message:
 *           type: string
 *           description: Detailed error message
 */

/**
 * @swagger
 * /api/v1/query:
 *   post:
 *     summary: Process a health query using AI
 *     description: Submits a natural language health query for a specific patient and returns an AI-generated response with relevant FHIR resources
 *     tags: [Query]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QueryRequest'
 *     responses:
 *       200:
 *         description: Query processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QueryResponse'
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Processing failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
