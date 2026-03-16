import { Router, Request, Response } from 'express';
import { logger } from '../../config/logging';
import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/settings';

const router = Router();

/**
 * @swagger
 * /api/models:
 *   get:
 *     summary: Get available Gemini models
 *     description: Retrieves a list of all available Gemini models from the Google GenAI API
 *     tags:
 *       - Models
 *     responses:
 *       200:
 *         description: Successfully retrieved model list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ModelsResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   description: Error message
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const client = new GoogleGenAI({
      apiKey: config.GEMINI_API_KEY,
      apiVersion: 'v1alpha',
    });

    logger.info('Fetching available models...');
    const modelsPager = await client.models.list();
    
    const models: any[] = [];
    let modelCount = 0;
    
    for await (const model of modelsPager) {
      modelCount++;
      models.push({
        name: model.name,
        displayName: model.displayName || 'No display name',
        description: model.description || 'No description'
      });
    }

    logger.info(`Successfully retrieved ${modelCount} models`);

    res.json({
      success: true,
      count: modelCount,
      models: models
    });

  } catch (error: any) {
    logger.error('Failed to fetch models', { error: error.message });
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch models'
    });
  }
});

export default router;
