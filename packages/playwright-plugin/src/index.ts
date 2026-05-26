import {
  calculateQuantiles,
  getCallingFile,
  InstrumentHooks,
  MARKER_TYPE_BENCHMARK_END,
  MARKER_TYPE_BENCHMARK_START,
  msToS,
  writeWalltimeResults,
  type Benchmark,
  type BenchmarkStats,
} from "@codspeed/core";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright-core";

declare const __VERSION__: string;

const DEFAULT_ROUNDS = 3;
const DEFAULT_PROFILING_JS_FLAGS =
  "--perf-prof --perf-prof-annotate-wasm --interpreted-frames-native-stack --no-turbo-inlining --no-sandbox";

/**
 * The fixtures passed to a benchmark function, mirroring Playwright's `test`
 * API. Currently exposes the target's main window as `page`.
 */
export interface BenchFixtures {
  page: Page;
}

/**
 * The function whose execution is measured. Everything that runs inside it is
 * included in the reported timing.
 */
export type BenchFunction = (fixtures: BenchFixtures) => void | Promise<void>;

export type BenchHook = (fixtures: BenchFixtures) => void | Promise<void>;

/**
 * Electron-specific target options.
 */
export interface ElectronTarget {
  kind: "electron";
  /**
   * Absolute path to the Electron main entrypoint (e.g. `out/main/index.js`).
   */
  appPath: string;
  /**
   * CLI flags forwarded to Electron.
   */
  electronArgs?: string[];
  /**
   * Working directory for the Electron process. Defaults to `process.cwd()`.
   */
  cwd?: string;
  /**
   * Absolute path to the Electron executable. When omitted, it is resolved from
   * the `electron` package in `cwd`. Set this only to override that default.
   */
  electronExecutablePath?: string;
}

/**
 * Determines what kind of host playwright is going to run the tests on
 */
export type Target = ElectronTarget;

/**
 * Minimal options for a benchmark. Inspired by Vitest's `bench`, but kept
 * deliberately small.
 */
export interface BenchOptions {
  /**
   * Target configuration. The `kind` field selects the target; the remaining
   * fields are specific to that kind.
   */
  target: Target;
  /**
   * Number of measurement rounds to perform. Defaults to 3, or the value of CODSPEED_PLAYWRIGHT_ROUNDS.
   */
  rounds?: number;
  /**
   * Runs before each round, after the target is ready. Use it to bring the app to
   * a ready state. Not measured.
   */
  beforeRound?: BenchHook;
  /**
   * Runs after each round, before the target is torn down. Not measured.
   */
  afterRound?: BenchHook;
}

let integrationInitialized = false;

/**
 * Register the integration and environment with the instrumentation. This is
 * process-global, so it only needs to run once regardless of how many
 * benchmarks are defined.
 */
function ensureIntegrationSetup(): void {
  if (integrationInitialized) return;
  integrationInitialized = true;

  InstrumentHooks.setIntegration("node-custom", __VERSION__);
  InstrumentHooks.setEnvironment("nodejs", "version", process.versions.node);
  InstrumentHooks.setEnvironment("nodejs", "v8", process.versions.v8);
  InstrumentHooks.writeEnvironment(process.pid);
}

function resolveRounds(optionRounds: number | undefined): number {
  const envValue = process.env.CODSPEED_PLAYWRIGHT_ROUNDS;
  const raw = envValue ?? optionRounds;
  if (raw === undefined) return DEFAULT_ROUNDS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid rounds value: ${raw} (expected positive integer)`);
  }
  return n;
}

/**
 * Resolve the path to the Electron binary.
 *
 * Playwright resolves Electron via `require("electron/index.js")` from inside
 * its own package directory. Under isolated installs (e.g. pnpm), Playwright
 * cannot see the project's `electron` dependency and bails out with
 * "Electron executablePath not found!". We resolve it ourselves from the
 * benchmark's working directory, where `electron` is a real dependency.
 */
function resolveElectronExecutable(cwd: string): string {
  const require = createRequire(pathToFileURL(`${cwd}/`));
  // `electron`'s main module exports the absolute path to its binary.
  return require("electron") as string;
}

async function launchElectronApp(
  target: ElectronTarget,
): Promise<ElectronApplication> {
  const cwd = target.cwd ?? process.cwd();
  return electron.launch({
    args: [
      target.appPath,
      ...(target.electronArgs ?? []),
      `--js-flags=${DEFAULT_PROFILING_JS_FLAGS}`,
    ],
    cwd,
    executablePath:
      target.electronExecutablePath ?? resolveElectronExecutable(cwd),
  });
}

async function runOneSample(
  fn: BenchFunction,
  options: BenchOptions,
): Promise<bigint> {
  const app = await launchElectronApp(options.target);
  const page = await app.firstWindow();

  try {
    if (options.beforeRound) {
      await options.beforeRound({ page });
    }

    const startTs = InstrumentHooks.currentTimestamp();
    await fn({ page });
    const endTs = InstrumentHooks.currentTimestamp();

    InstrumentHooks.addMarker(
      process.pid,
      MARKER_TYPE_BENCHMARK_START,
      startTs,
    );
    InstrumentHooks.addMarker(process.pid, MARKER_TYPE_BENCHMARK_END, endTs);

    if (options.afterRound) {
      await options.afterRound({ page });
    }

    return endTs - startTs;
  } finally {
    await app.close();
  }
}

function buildStats(sampleTimesNs: bigint[]): BenchmarkStats {
  const sortedTimesNs = sampleTimesNs
    .map((n) => Number(n))
    .sort((a, b) => a - b);

  const sum = sortedTimesNs.reduce((acc, t) => acc + t, 0);
  const meanNs = sum / sortedTimesNs.length;
  const variance =
    sortedTimesNs.reduce((acc, t) => acc + (t - meanNs) ** 2, 0) /
    sortedTimesNs.length;
  const stdevNs = Math.sqrt(variance);

  const { q1_ns, median_ns, q3_ns, iqr_outlier_rounds, stdev_outlier_rounds } =
    calculateQuantiles({
      meanNs,
      stdevNs,
      sortedTimesNs,
    });

  return {
    min_ns: sortedTimesNs[0],
    max_ns: sortedTimesNs[sortedTimesNs.length - 1],
    mean_ns: meanNs,
    stdev_ns: stdevNs,
    q1_ns,
    median_ns,
    q3_ns,
    rounds: sortedTimesNs.length,
    total_time: msToS(sum / 1e6),
    iqr_outlier_rounds,
    stdev_outlier_rounds,
    iter_per_round: 1,
    warmup_iters: 0,
  };
}

/**
 * Define and run a CodSpeed-instrumented benchmark, mirroring Playwright's
 * `test` API.
 *
 * Launches the target once per round, runs the user-provided function around a
 * measured region, and writes walltime results to disk so that the CodSpeed
 * runner can pick them up.
 *
 * @example
 * ```ts
 * import { bench } from "@codspeed/playwright-plugin";
 *
 * bench(
 *   "renders the dashboard",
 *   async ({ page }) => {
 *     await page.getByRole("link", { name: "Dashboard" }).click();
 *     await page.getByRole("heading", { name: "Overview" }).waitFor();
 *   },
 *   {
 *     target: { kind: "electron", appPath: "out/main/index.js" },
 *     rounds: 5,
 *   },
 * );
 * ```
 */
export async function bench(
  name: string,
  fn: BenchFunction,
  options: BenchOptions,
): Promise<void> {
  const rounds = resolveRounds(options.rounds);
  const uri = `${getCallingFile(1)}::${name}`;

  ensureIntegrationSetup();

  InstrumentHooks.setExecutedBenchmark(process.pid, uri);
  InstrumentHooks.startBenchmark();

  const sampleTimesNs: bigint[] = [];
  try {
    for (let i = 0; i < rounds; i++) {
      const elapsedNs = await runOneSample(fn, options);
      sampleTimesNs.push(elapsedNs);
      console.log(
        `[CodSpeed] [round ${i + 1}/${rounds}] ${(Number(elapsedNs) / 1e6).toFixed(2)} ms`,
      );
    }
  } finally {
    InstrumentHooks.stopBenchmark();
  }

  const benchmark: Benchmark = {
    name,
    uri,
    config: {
      warmup_time_ns: null,
      min_round_time_ns: null,
      max_rounds: rounds,
      max_time_ns: null,
    },
    stats: buildStats(sampleTimesNs),
  };

  writeWalltimeResults([benchmark]);
}

export type { Page } from "playwright-core";
