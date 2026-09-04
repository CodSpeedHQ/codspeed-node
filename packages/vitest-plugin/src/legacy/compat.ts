import type { RunnerTestCase, RunnerTestSuite } from "vitest";
import type { Tinybench } from "../instrument";

/**
 * A Vitest 3/4 benchmark task: a test case flagged as a benchmark, carrying the
 * raw tinybench output on its result.
 */
export interface BenchmarkTask extends RunnerTestCase {
  meta: RunnerTestCase["meta"] & { benchmark?: boolean };
}

/** The tinybench options Vitest 3/4 stores alongside a registered benchmark. */
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
 * The Vitest 3/4 benchmark backend, which Vitest 5 removed: benchmarks now run
 * through a `benchmark.provider` (see `v5/provider.ts`) and the runner is gone.
 * The shapes are declared here because neither the removed `vitest/runners` and
 * `vitest/suite` subpaths nor the Vitest 5 typings this package compiles against
 * describe them.
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
 * subpaths, which warn on import. Both lookups have to be dynamic: which of the
 * two shapes exists depends on the Vitest the user installed, and the subpaths
 * don't resolve at all on Vitest 5.
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

  // These subpaths only exist on Vitest 3/4, so they don't resolve when the
  // plugin is installed alongside Vitest 5.
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
