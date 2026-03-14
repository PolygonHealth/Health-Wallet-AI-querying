"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const settings_1 = require("../config/settings");
const logging_1 = require("../config/logging");
const query_1 = require("./routes/query");
const health_1 = require("./routes/health");
const benchmark_1 = require("./routes/benchmark");
function createApp() {
    (0, logging_1.setupLogging)(settings_1.config.logLevel);
    const app = (0, express_1.default)();
    // Middleware
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({
        origin: '*',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }));
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // Request logging
    app.use((req, res, next) => {
        logging_1.logger.info(`${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
        });
        next();
    });
    // Routes
    app.use('/api/v1', query_1.queryRouter);
    app.use('/api/v1', benchmark_1.benchmarkRouter);
    app.use('/', health_1.healthRouter);
    // Root endpoint
    app.get('/', (req, res) => {
        res.json({
            service: 'Polygon Health AI Query Engine - TypeScript',
            status: 'running',
            docs: '/api-docs',
            health: '/health',
            version: '0.1.0',
        });
    });
    // Global error handler
    app.use((err, req, res, next) => {
        logging_1.logger.error('Unhandled error', {
            error: err.message,
            stack: err.stack,
            path: req.path,
            method: req.method,
        });
        res.status(500).json({
            error: 'Internal server error',
            message: settings_1.config.logLevel === 'debug' ? err.message : undefined,
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
//# sourceMappingURL=app.js.map