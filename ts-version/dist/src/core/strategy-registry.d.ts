import { BaseStrategy } from './models';
type StrategyFactory = (...args: any[]) => BaseStrategy;
declare class StrategyRegistry {
    private strategies;
    register(name: string, factory: StrategyFactory): void;
    get(name: string): StrategyFactory | undefined;
    list(): string[];
    has(name: string): boolean;
}
export declare const strategyRegistry: StrategyRegistry;
export declare function registerStrategy(name: string): (target: any) => any;
export {};
//# sourceMappingURL=strategy-registry.d.ts.map