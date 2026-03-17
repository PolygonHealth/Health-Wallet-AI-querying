import { Router, Request, Response } from 'express';
import { QueryRequestSchema, QueryResponseSchema, QueryContextSchema } from '../../core/models';
import { resolveStrategy } from '../dependencies';
import { logger } from '../../config/logging';
import { getDbPool } from '@/db/session';
import { config } from '@/config/settings';
import { getPatientIdFromHeaders } from '../utils/patientId';

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
 *           example: "2efabc76-892a-b1cf-f47b-4c046d7b197d"
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
 *           default: "gemini-3-flash-preview"
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
 * /api/fhir/query:
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
// Dependency injection function (match Python: Depends(get_session_factory))
function getSessionFactory() {
  return getDbPool();
}

router.post('/query', async (req: Request, res: Response) => {
  try {
    // Validate request
    const validatedQuery = QueryRequestSchema.parse(req.body);
    
    // Get patientId from request body or headers
    let patientId = validatedQuery.patientId;
    if (!patientId) {
      patientId = await getPatientIdFromHeaders(req);
    }
    
    const strategyName = validatedQuery.strategy || config.DEFAULT_STRATEGY;
    const modelName = validatedQuery.model || config.DEFAULT_MODEL;

    // Get session factory (match Python: session_factory=Depends(get_session_factory))
    const sessionFactory = getSessionFactory();

    try {
      // Resolve strategy (match Python: resolve_strategy(strategy_name, session_factory, model_name))
      const strategy = resolveStrategy(strategyName, sessionFactory, modelName);
      
      // Execute query (match Python: QueryContext)
      const context = QueryContextSchema.parse({
        patientId,
        queryText: validatedQuery.query,
        strategyName,
        modelName,
      });

      const result = await strategy.execute(context);
      
      // Return response (match Python: QueryResponse.from_result(result))
      return res.json(result);
    } catch (error) {
      // Match Python: HTTPException(status_code=400, detail=str(e))
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(400).json({
        error: 'Query processing failed',
        message: errorMessage,
      });
    }
  } catch (error) {
    // Request validation error
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(400).json({
      error: 'Invalid request',
      message: errorMessage,
    });
  }
});

export { router as queryRouter };
