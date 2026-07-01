type VitestExports = typeof import("vitest");

/**
 * Vitest 4.1 moved the benchmark runner and the suite helpers to the main
 * `vitest` entry point and deprecated the `vitest/runners` and `vitest/suite`
 * subpaths, which warn on import.
 */
async function resolveVitestApi() {
  const { BenchmarkRunner, TestRunner }: Partial<VitestExports> =
    await import("vitest");

  if (BenchmarkRunner && TestRunner) {
    return {
      NodeBenchmarkRunner: BenchmarkRunner,
      getHooks: TestRunner.getSuiteHooks,
      getBenchFn: TestRunner.getBenchFn,
      getBenchOptions: TestRunner.getBenchOptions,
    };
  }

  const [runners, suite] = await Promise.all([
    import("vitest/runners"),
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
