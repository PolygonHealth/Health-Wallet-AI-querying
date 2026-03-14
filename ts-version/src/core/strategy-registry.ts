import { BaseStrategy } from './models';
import { logger } from '../config/logging';

type StrategyFactory = (...args: any[]) => BaseStrategy;
type StrategyClass = new (...args: any[]) => BaseStrategy;

class StrategyRegistry {
  private strategies = new Map<string, StrategyFactory>();
  private strategyClasses = new Map<string, StrategyClass>();

  register(name: string, factory: StrategyFactory): void;
  register(name: string, strategyClass: StrategyClass): void;
  register(name: string, factoryOrClass: StrategyFactory | StrategyClass): void {
    if (this.strategies.has(name) || this.strategyClasses.has(name)) {
      logger.warn(`Strategy ${name} is already registered, overwriting`);
    }
    
    if (typeof factoryOrClass === 'function' && factoryOrClass.prototype) {
      // It's a class constructor
      this.strategyClasses.set(name, factoryOrClass as StrategyClass);
    } else {
      // It's a factory function
      this.strategies.set(name, factoryOrClass as StrategyFactory);
    }
    
    logger.info(`Registered strategy: ${name}`);
  }

  get(name: string): StrategyFactory | undefined {
    return this.strategies.get(name);
  }

  getClass(name: string): StrategyClass | undefined {
    return this.strategyClasses.get(name);
  }

  list(): string[] {
    return Array.from(new Set([...this.strategies.keys(), ...this.strategyClasses.keys()]));
  }

  has(name: string): boolean {
    return this.strategies.has(name) || this.strategyClasses.has(name);
  }
}

export const strategyRegistry = new StrategyRegistry();

// Decorator for registering strategies
export function registerStrategy(name: string) {
  return function <T extends BaseStrategy>(target: new (...args: any[]) => T): typeof target {
    strategyRegistry.register(name, target);
    return target;
  };
}
