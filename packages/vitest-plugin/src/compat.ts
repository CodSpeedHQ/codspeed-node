/**
 * Compatibility layer for vitest imports across versions.
 *
 * Vitest 4.1 deprecated `vitest/runners` and `vitest/suite` subpath imports,
 * moving exports to the main `vitest` entry point. This module resolves
 * the correct imports at runtime to avoid deprecation warnings while
 * maintaining compatibility with vitest 3.2+.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClass = new (...args: any[]) => any;

// Resolve NodeBenchmarkRunner: vitest >= 4.1 exports it as BenchmarkRunner
// from the main entry; older versions export it from vitest/runners.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vitestMod: any = await import("vitest");
const _BenchmarkRunner: AnyClass | undefined = vitestMod.BenchmarkRunner;

let _NodeBenchmarkRunner: AnyClass;
if (_BenchmarkRunner) {
  _NodeBenchmarkRunner = _BenchmarkRunner;
} else {
  const runners = await import("vitest/runners");
  _NodeBenchmarkRunner = runners.NodeBenchmarkRunner;
}
export const NodeBenchmarkRunner = _NodeBenchmarkRunner;

// Resolve suite helpers: vitest >= 4.1 exposes them as TestRunner static
// methods; older versions export them from vitest/suite.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuiteFn = (...args: any[]) => any;
let _getHooks: SuiteFn;
let _getBenchFn: SuiteFn;
let _getBenchOptions: SuiteFn;

const TestRunner = vitestMod.TestRunner;
if (TestRunner?.getSuiteHooks) {
  _getHooks = TestRunner.getSuiteHooks;
  _getBenchFn = TestRunner.getBenchFn;
  _getBenchOptions = TestRunner.getBenchOptions;
} else {
  const suite = await import("vitest/suite");
  _getHooks = suite.getHooks;
  _getBenchFn = suite.getBenchFn;
  _getBenchOptions = suite.getBenchOptions;
}

export const getHooks = _getHooks;
export const getBenchFn = _getBenchFn;
export const getBenchOptions = _getBenchOptions;
