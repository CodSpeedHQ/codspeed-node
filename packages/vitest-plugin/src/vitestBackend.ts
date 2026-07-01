import { getInstrumentMode } from "@codspeed/core";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { join } from "path";
import { type ViteUserConfig } from "vitest/config";

/**
 * Everything about integrating with Vitest that depends on which Vitest
 * generation the user installed, resolved once so the rest of the plugin reads a
 * `VitestBackend` and never inspects the version itself.
 */
export interface VitestBackend {
  /**
   * Whether the plugin should stay active for this Vite `mode`. When false the
   * plugin's `apply` returns false and it is dropped entirely.
   */
  isActiveForViteMode(mode: string): boolean;

  /**
   * Whether the current invocation is running benchmarks (as opposed to tests),
   * given the incoming config and Vite `mode`.
   */
  isBenchmarkRun(config: ViteUserConfig, mode: string): boolean;

  /**
   * The `test` config fragment that wires the benchmark instrumentation into
   * Vitest: the V8 exec args (whose placement moved across versions) plus the
   * integration seam (a custom runner on legacy, a setup file on v5).
   */
  getBenchmarkTestConfig(
    v8Flags: string[],
    resolveFile: (name: string) => string,
  ): ViteUserConfig["test"];

  /**
   * The `test.benchmark` fragment asking tinybench to retain per-iteration
   * samples so the walltime runner can compute quantiles. Only used in walltime
   * mode. The option was renamed (`includeSamples` → `retainSamples`) when
   * Vitest 5 moved to tinybench v6.
   */
  getWalltimeBenchmarkConfig(): Record<string, boolean>;
}

/**
 * Vitest 5 reworked the benchmark backend: the dedicated `NodeBenchmarkRunner`
 * and the `vitest/runners` / `vitest/suite` entrypoints are gone, benchmarks run
 * inside `test()` through the unified `TestRunner`, and tinybench moved to v6.
 * The integration seam therefore differs fundamentally (a `TestRunner` patch
 * installed from a setup file vs. a runner subclass per mode), which is why the
 * two backends are separate implementations rather than a pile of inline
 * ternaries.
 *
 * When the version cannot be detected we assume the latest supported major.
 */
export function resolveVitestBackend(): VitestBackend {
  const major = getVitestMajorVersion() ?? 5;
  return major >= 5 ? new V5Backend() : new LegacyBackend(major);
}

/**
 * Resolve the major version of the Vitest the *user's project* depends on, not
 * the one bundled alongside this plugin. Returns null when it cannot be found,
 * letting `resolveVitestBackend` fall back to the latest supported major.
 */
function getVitestMajorVersion(): number | null {
  try {
    const require = createRequire(join(process.cwd(), "package.json"));
    const vitestPkgPath = require.resolve("vitest/package.json");
    const vitestPkg = JSON.parse(readFileSync(vitestPkgPath, "utf-8"));
    return parseInt(vitestPkg.version.split(".")[0], 10);
  } catch {
    return null;
  }
}

/**
 * Vitest 5+. `vitest bench` runs under the `"test"` mode with
 * `test.benchmark.enabled` flipped (there is no dedicated benchmark mode), so
 * the plugin stays active for every mode and gates on the config instead.
 * Instrumentation is installed from a setup file that patches the shared
 * `TestRunner` (see `v5/setup.ts`).
 */
class V5Backend implements VitestBackend {
  isActiveForViteMode(): boolean {
    return true;
  }

  isBenchmarkRun(config: ViteUserConfig): boolean {
    // `benchmark.enabled` only exists on the Vitest 5 config; the v3/4 typings
    // we may be compiled against don't know about it.
    const benchmark = config.test?.benchmark as
      | { enabled?: boolean }
      | undefined;
    return benchmark?.enabled === true;
  }

  getBenchmarkTestConfig(
    v8Flags: string[],
    resolveFile: (name: string) => string,
  ): ViteUserConfig["test"] {
    // When CodSpeed isn't driving the run, leave Vitest's benchmark execution
    // untouched (no instrumentation setup file), matching the legacy backend.
    const setupFiles =
      getInstrumentMode() === "disabled" ? undefined : [resolveFile("v5/setup")];

    return {
      execArgv: v8Flags,
      ...(setupFiles && { setupFiles }),
    };
  }

  getWalltimeBenchmarkConfig(): Record<string, boolean> {
    return { retainSamples: true };
  }
}

/**
 * Vitest 3/4. `vitest bench` runs under a dedicated `"benchmark"` Vite mode, and
 * instrumentation is installed through a custom `test.runner` subclass of
 * `NodeBenchmarkRunner`, one per instrument mode (`analysis` / `walltime`).
 */
class LegacyBackend implements VitestBackend {
  constructor(private readonly major: number) {}

  isActiveForViteMode(mode: string): boolean {
    return mode === "benchmark";
  }

  isBenchmarkRun(_config: ViteUserConfig, mode: string): boolean {
    return mode === "benchmark";
  }

  getBenchmarkTestConfig(
    v8Flags: string[],
    resolveFile: (name: string) => string,
  ): ViteUserConfig["test"] {
    const instrumentMode = getInstrumentMode();
    const runner =
      instrumentMode === "disabled"
        ? undefined
        : resolveFile(join("legacy", instrumentMode));

    return {
      // Vitest 3 nests exec args under `poolOptions.forks`; v4 moved them to a
      // top-level `test.execArgv`.
      // See: https://vitest.dev/guide/migration.html#pool-rework
      ...(this.major >= 4
        ? { execArgv: v8Flags }
        : { poolOptions: { forks: { execArgv: v8Flags } } }),
      ...(runner && { runner }),
    };
  }

  getWalltimeBenchmarkConfig(): Record<string, boolean> {
    return { includeSamples: true };
  }
}
