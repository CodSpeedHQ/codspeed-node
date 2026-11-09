import {
  getGitDir,
  getInstrumentMode,
  processIsolation,
  type WalltimeOptions,
} from "@codspeed/core";
import { join } from "path";
import { type ViteUserConfig } from "vitest/config";
import {
  type TestProject,
  type Vitest,
  version as vitestVersion,
} from "vitest/node";
import { provideParentContext } from "./v5/forkContext";
import { forkReporter } from "./v5/forkReporter";

/** The parts of the Vitest integration that depend on the installed major. */
export interface VitestBackend {
  isActive(mode: string): boolean;
  configureIsolation(userConfig: ViteUserConfig): void;

  /** Runs per project, before Vitest initializes its global setup. */
  configureVitest(
    project: TestProject,
    vitest: Vitest,
    options: WalltimeOptions,
  ): void;

  getBenchmarkTestConfig(
    v8Flags: string[],
    resolveFile: (name: string) => string,
    userTestConfig: ViteUserConfig["test"],
  ): ViteUserConfig["test"];
}

/**
 * `vitest` is a peer dependency, so `vitest/node` resolves to the Vitest that is
 * running this plugin.
 */
export function resolveVitestBackend(): VitestBackend {
  const major = parseInt(vitestVersion, 10);
  return major >= 5 ? new V5Backend() : new LegacyBackend(major);
}

// `configureVitest` runs once per project, but one reporter sees every
// project's modules: a second one would fork every benchmark twice.
const vitestsWithForkReporter = new WeakSet<Vitest>();

/** Vitest 5+: benchmarks run through a `benchmark.provider` (`v5/provider.ts`). */
class V5Backend implements VitestBackend {
  /**
   * Vitest 5 has no benchmark Vite mode and clones the benchmark project after
   * config hooks run, so a bench run can't be detected from the config. Gate on
   * CodSpeed driving the run instead; otherwise Vitest uses its own provider.
   */
  isActive(): boolean {
    return getInstrumentMode() !== "disabled";
  }

  configureIsolation(userConfig: ViteUserConfig): void {
    const isolationMode = processIsolation();
    if (isolationMode.kind !== "Fork") return;
    restrictToBenchmarkFile(userConfig, isolationMode.uri);
    // The parent's global setup is still up while its forks run: forks skip
    // it and inherit what it provided (see `configureProject`).
    userConfig.test!.globalSetup = [];
  }

  /**
   * The parent of a forked run measures nothing in its workers: they queue the
   * benchmarks, and the main process forks them once the run is over.
   */
  configureVitest(
    project: TestProject,
    vitest: Vitest,
    options: WalltimeOptions,
  ): void {
    const isolationMode = processIsolation();
    if (isolationMode.kind === "Fork") {
      provideParentContext(project);
      return;
    }
    if (isolationMode.kind !== "Forks") return;
    if (vitestsWithForkReporter.has(vitest)) return;
    vitestsWithForkReporter.add(vitest);
    // Vitest builds its reporters from the config after this hook runs.
    vitest.config.reporters.push(forkReporter(options));
  }

  getBenchmarkTestConfig(
    v8Flags: string[],
    resolveFile: (name: string) => string,
    userTestConfig: ViteUserConfig["test"],
  ): ViteUserConfig["test"] {
    // Vitest's export getter tracker runs inside the measured code; keep it off
    // unless the user explicitly configured it.
    const suppressExportGetterWarnings =
      userTestConfig?.benchmark?.suppressExportGetterWarnings ?? true;
    return {
      execArgv: v8Flags,
      benchmark: {
        provider: resolveFile("v5/provider"),
        suppressExportGetterWarnings,
      },
    };
  }
}

function restrictToBenchmarkFile(
  userConfig: ViteUserConfig,
  uri: string,
): void {
  const gitDir = getGitDir(userConfig.root ?? process.cwd());
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  // Replace rather than merge include globs: isolated children must not
  // transform and import unrelated benchmark files.
  const file = join(gitDir, uri.split("::")[0])
    .replace(/\\/g, "/")
    .replace(/[\\*?{}()[\]!+@]/g, "\\$&");
  userConfig.test ??= {};
  userConfig.test.benchmark ??= {};
  userConfig.test.benchmark.include = [file];
}

/**
 * Vitest 3/4: `vitest bench` runs in the `"benchmark"` Vite mode, and each
 * instrument mode has its own `test.runner` (`legacy/analysis`, `legacy/walltime`).
 */
class LegacyBackend implements VitestBackend {
  constructor(private readonly major: number) {}

  isActive(mode: string): boolean {
    return mode === "benchmark";
  }

  // Vitest 3/4 do not support process isolation.
  configureIsolation(): void {}
  configureVitest(): void {}

  getBenchmarkTestConfig(
    v8Flags: string[],
    resolveFile: (name: string) => string,
  ): ViteUserConfig["test"] {
    const instrumentMode = getInstrumentMode();
    const runner =
      instrumentMode === "disabled"
        ? undefined
        : resolveFile(join("legacy", instrumentMode));

    // Walltime needs per-iteration samples for quantiles. tinybench v2 calls the
    // option `includeSamples` (`retainSamples` in v6).
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
