import type { RunnerTestCase, RunnerTestSuite } from "vitest";
import type { Tinybench } from "../instrument";

export interface BenchmarkTask extends RunnerTestCase {
  meta: RunnerTestCase["meta"] & { benchmark?: boolean };
}

export interface LegacyBenchOptions {
  time?: number;
  warmupTime?: number;
  warmupIterations?: number;
  iterations?: number;
  setup?: (
    task: { name: string },
    mode: "run" | "warmup",
  ) => void | Promise<void>;
  teardown?: (
    task: { name: string },
    mode: "run" | "warmup",
  ) => void | Promise<void>;
}

/**
 * Vitest 3/4 benchmark internals, typed by hand: the package compiles against
 * Vitest 5, which removed them.
 */
export interface LegacyBenchmarkApi {
  NodeBenchmarkRunner: new (config?: unknown) => {
    config: unknown;
    runSuite(suite: RunnerTestSuite): Promise<void>;
    importTinybench(): Promise<Tinybench>;
  };
  getHooks: (suite: unknown) => Record<string, Array<() => unknown>>;
  getBenchFn: (benchmark: BenchmarkTask) => () => unknown;
  getBenchOptions: (benchmark: BenchmarkTask) => LegacyBenchOptions;
}

/**
 * Vitest 4.1 moved the benchmark runner and the suite helpers to the main
 * `vitest` entry point and deprecated the `vitest/runners` and `vitest/suite`
 * subpaths, which warn on import.
 */
async function resolveVitestApi(): Promise<LegacyBenchmarkApi> {
  // Vitest 5 exports an unrelated `TestRunner`, so the namespace has to be
  // re-typed from scratch rather than narrowed.
  const { BenchmarkRunner, TestRunner } =
    (await import("vitest")) as unknown as {
      BenchmarkRunner?: LegacyBenchmarkApi["NodeBenchmarkRunner"];
      TestRunner?: {
        getSuiteHooks: LegacyBenchmarkApi["getHooks"];
        getBenchFn: LegacyBenchmarkApi["getBenchFn"];
        getBenchOptions: LegacyBenchmarkApi["getBenchOptions"];
      };
    };

  if (BenchmarkRunner && TestRunner) {
    return {
      NodeBenchmarkRunner: BenchmarkRunner,
      getHooks: TestRunner.getSuiteHooks,
      getBenchFn: TestRunner.getBenchFn,
      getBenchOptions: TestRunner.getBenchOptions,
    };
  }

  const [runners, suite] = await Promise.all([
    // eslint-disable-next-line import/no-unresolved
    import("vitest/runners"),
    // eslint-disable-next-line import/no-unresolved
    import("vitest/suite"),
  ]);

  return {
    NodeBenchmarkRunner: runners.NodeBenchmarkRunner,
    getHooks: suite.getHooks,
    getBenchFn: suite.getBenchFn,
    getBenchOptions: suite.getBenchOptions,
  };
}

export const { NodeBenchmarkRunner, getHooks, getBenchFn, getBenchOptions } =
  await resolveVitestApi();
