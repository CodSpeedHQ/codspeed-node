// Vitest 3/4 exposed benchmark internals through `vitest/runners` and
// `vitest/suite`, and surfaced the `Benchmark` task type from `vitest`. Vitest 5
// removed all of these (benchmarks now run through the unified `TestRunner`).
//
// The legacy runner (`analysis.ts`, `walltime/`) still imports them and is only
// loaded when the user runs Vitest 3/4, but the plugin is type-checked against
// whichever Vitest is installed — including 5, where these are gone. These
// ambient declarations keep the legacy code compiling there without affecting
// runtime: the modules are never imported under v5.

import type * as tinybench from "tinybench";

declare module "vitest" {
  import type { RunnerTestCase } from "vitest";

  // In v3/4 a benchmark is a test case carrying tinybench output on its result.
  interface Benchmark extends RunnerTestCase {
    meta: RunnerTestCase["meta"] & { benchmark?: boolean };
  }
}

declare module "vitest/runners" {
  import type { RunnerTestSuite } from "vitest";

  export class NodeBenchmarkRunner {
    constructor(config?: unknown);
    config: unknown;
    runSuite(suite: RunnerTestSuite): Promise<void>;
    importTinybench(): Promise<typeof tinybench>;
  }
}

declare module "vitest/suite" {
  import type { Benchmark } from "vitest";

  export function getBenchFn(benchmark: Benchmark): () => unknown;
  export function getBenchOptions(benchmark: Benchmark): {
    time?: number;
    warmupTime?: number;
    warmupIterations?: number;
    iterations?: number;
  };
  export function getHooks(
    suite: unknown,
  ): Record<string, Array<() => unknown>>;
}
