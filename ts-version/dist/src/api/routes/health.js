"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const session_1 = require("../../db/session");
const logging_1 = require("../../config/logging");
const router = (0, express_1.Router)();
exports.healthRouter = router;
router.get('/health', async (req, res) => {
    try {
        const dbPool = (0, session_1.getDbPool)();
        // Test database connectivity
        await dbPool.query('SELECT 1');
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            database: 'connected',
        });
    }
    catch (error) {
        logging_1.logger.error('Health check failed', { error: error instanceof Error ? error.message : String(error) });
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
            database: 'disconnected',
        });
    }
});
// Additional health endpoints
router.get('/health/ready', async (req, res) => {
    try {
        const dbPool = (0, session_1.getDbPool)();
        await dbPool.query('SELECT 1');
        res.json({
            status: 'ready',
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'not ready',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
router.get('/health/live', (req, res) => {
    res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
//# sourceMappingURL=health.js.map