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
   * integration seam. Legacy wires a custom runner subclass (and, in walltime
   * mode, asks tinybench to retain samples); v5 wires a `benchmark.provider`
   * that owns execution and sample retention entirely.
   */
  getBenchmarkTestConfig(
    v8Flags: string[],
    resolveFile: (name: string) => string,
  ): ViteUserConfig["test"];
}

/**
 * The integration seam differs across Vitest generations: on 3/4 benchmarks run
 * through a `NodeBenchmarkRunner` subclass (via `vitest/runners` /
 * `vitest/suite`), while 5+ exposes a `benchmark.provider` API and dropped those
 * entrypoints.
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
 * Vitest 5+. There is no dedicated benchmark Vite mode anymore (`vitest bench`
 * runs under `"test"`), so the plugin stays active for every mode.
 * Instrumentation is installed through a `benchmark.provider` that owns
 * benchmark execution (see `v5/provider.ts`).
 */
class V5Backend implements VitestBackend {
  isActiveForViteMode(): boolean {
    return true;
  }

  /**
   * Vitest 5 clones its benchmark project from the resolved one *after* the Vite
   * config hooks ran, so a benchmark run cannot be read off the incoming config:
   * `test.benchmark.enabled` still holds the user's value and `vitest bench`
   * only sets an internal CLI flag. CodSpeed exclusively drives benchmark runs,
   * so gate on the instrument mode instead. Without CodSpeed the plugin injects
   * nothing and Vitest runs the benchmarks through its own tinybench provider.
   */
  isBenchmarkRun(): boolean {
    return getInstrumentMode() !== "disabled";
  }

  getBenchmarkTestConfig(
    v8Flags: string[],
    resolveFile: (name: string) => string,
  ): ViteUserConfig["test"] {
    return {
      execArgv: v8Flags,
      // The provider owns benchmark execution: it runs the registered functions
      // under instrumentation (analysis) or drives tinybench itself (walltime).
      benchmark: { provider: resolveFile("v5/provider") },
    };
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

    // Walltime asks tinybench to retain per-iteration samples so the runner can
    // compute quantiles. On tinybench v2 (Vitest 3/4) the option is
    // `includeSamples` (renamed `retainSamples` in v6).
    const benchmark =
      instrumentMode === "walltime" ? { includeSamples: true } : undefined;

    return {
      // Vitest 3 nests exec args under `poolOptions.forks`; v4 moved them to a
      // top-level `test.execArgv`.
      // See: https://vitest.dev/guide/migration.html#pool-rework
      ...(this.major >= 4
        ? { execArgv: v8Flags }
        : { poolOptions: { forks: { execArgv: v8Flags } } }),
      ...(runner && { runner }),
      ...(benchmark && { benchmark }),
    } as ViteUserConfig["test"];
  }
}
