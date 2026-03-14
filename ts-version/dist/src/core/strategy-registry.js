"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.strategyRegistry = void 0;
exports.registerStrategy = registerStrategy;
const logging_1 = require("../config/logging");
class StrategyRegistry {
    constructor() {
        this.strategies = new Map();
    }
    register(name, factory) {
        if (this.strategies.has(name)) {
            logging_1.logger.warn(`Strategy ${name} is already registered, overwriting`);
        }
        this.strategies.set(name, factory);
        logging_1.logger.info(`Registered strategy: ${name}`);
    }
    get(name) {
        return this.strategies.get(name);
    }
    list() {
        return Array.from(this.strategies.keys());
    }
    has(name) {
        return this.strategies.has(name);
    }
}
exports.strategyRegistry = new StrategyRegistry();
// Decorator for registering strategies
function registerStrategy(name) {
    return function (target) {
        exports.strategyRegistry.register(name, target);
        return target;
    };
}
//# sourceMappingURL=strategy-registry.js.map