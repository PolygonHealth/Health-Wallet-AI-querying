import { BaseStrategy } from './models';
import { logger } from '../config/logging';

type StrategyFactory = (...args: any[]) => BaseStrategy;

class StrategyRegistry {
  private strategies = new Map<string, StrategyFactory>();

  register(name: string, factory: StrategyFactory): void {
    if (this.strategies.has(name)) {
      logger.warn(`Strategy ${name} is already registered, overwriting`);
    }
    this.strategies.set(name, factory);
    logger.info(`Registered strategy: ${name}`);
  }

  get(name: string): StrategyFactory | undefined {
    return this.strategies.get(name);
  }

  list(): string[] {
    return Array.from(this.strategies.keys());
  }

  has(name: string): boolean {
    return this.strategies.has(name);
  }
}

export const strategyRegistry = new StrategyRegistry();

// Decorator for registering strategies
export function registerStrategy(name: string) {
  return function (target: any) {
    strategyRegistry.register(name, target);
    return target;
  };
}
