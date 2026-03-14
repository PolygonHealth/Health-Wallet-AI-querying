"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupLogging = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const settings_1 = require("./settings");
const format = winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
    }
    if (stack) {
        log += `\n${stack}`;
    }
    return log;
}));
exports.logger = winston_1.default.createLogger({
    level: settings_1.config.logLevel,
    format,
    transports: [
        new winston_1.default.transports.Console(),
    ],
});
const setupLogging = (level) => {
    exports.logger.level = level;
    exports.logger.info(`Logging set to ${level} level`);
};
exports.setupLogging = setupLogging;
//# sourceMappingURL=logging.js.map