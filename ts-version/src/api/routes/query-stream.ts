import { Router, Request, Response } from 'express';
import { QueryRequestSchema, QueryContextSchema } from '../../core/models';
import { resolveStrategy } from '../dependencies';
import { logger } from '../../config/logging';
import { getDbPool } from '@/db/session';
import { config } from '@/config/settings';
import { StreamEvent } from '../../core/strategies/langgraph/state';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     StreamEvent:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [thinking, tool_call, tool_result, graph_step, complete, error]
 *           description: Type of streaming event
 *         data:
 *           type: object
 *           description: Event data
 *           properties:
 *             message:
 *               type: string
 *               description: Event message
 *             toolName:
 *               type: string
 *               description: Name of the tool being called
 *             node:
 *               type: string
 *               description: Graph node being executed (llm or tools)
 *             turnCount:
 *               type: number
 *               description: Current conversation turn count
 *             tokensSoFar:
 *               type: number
 *               description: Total tokens used so far
 *             toolCount:
 *               type: number
 *               description: Number of tools being executed
 *             finalResponse:
 *               type: string
 *               description: Final complete response
 *             resourceIds:
 *               type: array
 *               items:
 *                 type: string
 *               description: FHIR resource IDs
 *             tokensIn:
 *               type: number
 *               description: Input tokens used
 *             tokensOut:
 *               type: number
 *               description: Output tokens generated
 *             latencyMs:
 *               type: number
 *               description: Processing latency
 *             error:
 *               type: string
 *               description: Error message
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Event timestamp
 */

/**
 * @swagger
 * /api/fhir/query-stream:
 *   post:
 *     summary: Process a health query with streaming responses
 *     description: Submits a natural language health query and streams real-time events during AI processing including tool calls and response generation
 *     tags: [Query]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QueryRequest'
 *     responses:
 *       200:
 *         description: Streaming events
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: Server-Sent Events stream
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

// Dependency injection function
function getSessionFactory() {
  return getDbPool();
}

function sendSSEEvent(res: Response, event: StreamEvent) {
  const eventData = `data: ${JSON.stringify(event.data.message)}\n\n`;
  res.write(eventData);
}

router.post('/query-stream', async (req: Request, res: Response) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  try {
    // Validate request
    const validatedQuery = QueryRequestSchema.parse(req.body);
    
    const strategyName = validatedQuery.strategy || config.DEFAULT_STRATEGY;
    const modelName = validatedQuery.model || config.DEFAULT_MODEL;

    // Get session factory
    const sessionFactory = getSessionFactory();

    try {
      // Resolve strategy
      const strategy = resolveStrategy(strategyName, sessionFactory, modelName);
      
      // Create context
      const context = QueryContextSchema.parse({
        patientId: validatedQuery.patientId,
        queryText: validatedQuery.query,
        strategyName,
        modelName,
      });

      // Execute strategy with streaming
      const result = await (strategy as any).execute(context, (event: StreamEvent) => {
        sendSSEEvent(res, event);
      });

      res.end();
    } catch (error) {
      // Send error event
      const errorMessage = error instanceof Error ? error.message : String(error);
      sendSSEEvent(res, {
        type: 'error',
        data: {
          error: 'Query processing failed',
          message: errorMessage
        },
        timestamp: new Date().toISOString()
      });
      res.end();
    }
  } catch (error) {
    // Request validation error
    const errorMessage = error instanceof Error ? error.message : String(error);
    sendSSEEvent(res, {
      type: 'error',
      data: {
        error: 'Invalid request',
        message: errorMessage
      },
      timestamp: new Date().toISOString()
    });
    res.end();
  }
});

export { router as queryStreamRouter };
