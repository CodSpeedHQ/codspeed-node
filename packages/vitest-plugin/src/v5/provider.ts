import {
  getGitDir,
  getInstrumentMode,
  InstrumentHooks,
  optimizeFunction,
  optimizeFunctionSync,
  setupCore,
  teardownCore,
  wrapWithRootFrame,
  wrapWithRootFrameSync,
  type Benchmark,
} from "@codspeed/core";
import { createRequire } from "module";
import path from "path";
import type {
  BenchmarkGroup,
  BenchmarkProvider,
  BenchRegistrationInput,
  BenchResult,
  BenchRunOptions,
} from "vitest";
import {
  installInstrumentHooks,
  tinybenchTaskToBenchmark,
  writeAndLogWalltimeResults,
  type TinybenchBench,
  type TinybenchOptions,
  type TinybenchTask,
} from "../instrument";

/** tinybench's per-task lifecycle hooks (a subset of `FnOptions`). */
interface TinybenchFnOptions {
  beforeAll?: (mode?: "run" | "warmup") => unknown;
  beforeEach?: (mode?: "run" | "warmup") => unknown;
  afterEach?: (mode?: "run" | "warmup") => unknown;
  afterAll?: (mode?: "run" | "warmup") => unknown;
}

type BenchFn = BenchRegistrationInput["fn"];

/** tinybench's statistics for one dimension (latency or throughput). */
type BenchStatistics = BenchResult["latency"];

/**
 * The subset of the host tinybench Bench the walltime path drives. The timing
 * fields are the *resolved* options (tinybench exposes them as readonly
 * instance properties), which is what the recorded benchmark config reports.
 */
interface TinybenchWithTasks extends TinybenchBench {
  add: (
    name: string,
    fn: BenchRegistrationInput["fn"],
    fnOpts?: TinybenchFnOptions,
  ) => unknown;
  run: () => Promise<TinybenchTask[]>;
  tasks: TinybenchTask[];
  readonly iterations: number;
  readonly time: number;
  readonly warmup: boolean;
  readonly warmupIterations: number;
  readonly warmupTime: number;
}

/**
 * The host tinybench module, modeled structurally: the plugin's own tinybench
 * dependency may be a different major, so its types can't describe the module
 * resolved from the installed Vitest. `BenchRunOptions` is Vitest's re-export of
 * the tinybench options it accepts, hence of the version it depends on.
 */
interface HostTinybench {
  Bench: new (options?: BenchRunOptions) => TinybenchWithTasks;
}

const isWalltime = getInstrumentMode() === "walltime";

// Vitest imports a provider module at most once per worker, and the plugin only
// wires this one up when CodSpeed drives the run (see `V5Backend`), so this is
// the per-worker setup. It must not be redone per benchmark: `setupCore()`
// truncates the process' perf map, which has to cover the whole worker.
setupCore();
process.once("beforeExit", () => teardownCore());

/**
 * Build the URI prefix shared by every benchmark of a group: the git-relative
 * file path followed by the suite/test path, `::`-separated (e.g.
 * `src/a.bench.ts::my suite::my test`). Each registration name is appended to
 * it, so a group registering several benchmarks (`bench.compare()`) reports one
 * URI per benchmark.
 */
function buildGroupUri(test: BenchmarkGroup["test"]): string {
  const filepath = test.file?.filepath;
  if (!filepath) {
    throw new Error("[CodSpeed] could not resolve the running benchmark file");
  }
  const gitDir = getGitDir(filepath);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  const relativeFile = path.relative(gitDir, filepath);
  // `fullTestName` uses " > " between suite levels; normalize to "::".
  const testPath = test.fullTestName.split(" > ").join("::");
  return [relativeFile, testPath].filter(Boolean).join("::");
}

/**
 * Resolve the tinybench the *host* Vitest uses so walltime mode returns results
 * in the exact shape Vitest serializes. The plugin's own tinybench may be a
 * different major, so it is resolved relative to the installed Vitest.
 */
async function importHostTinybench(): Promise<HostTinybench> {
  const require = createRequire(import.meta.url);
  const vitestRequire = createRequire(require.resolve("vitest/package.json"));
  return import(vitestRequire.resolve("tinybench"));
}

function analysisResult(name: string): BenchResult {
  // Zeroed statistics: enough to satisfy Vitest's reporter and its serializer.
  const statistics: BenchStatistics = {
    aad: 0,
    critical: 0,
    df: 0,
    mad: 0,
    max: 0,
    mean: 0,
    min: 0,
    moe: 0,
    p50: 0,
    p75: 0,
    p99: 0,
    p995: 0,
    p999: 0,
    rme: 0,
    samples: undefined,
    samplesCount: 0,
    sd: 0,
    sem: 0,
    variance: 0,
  };

  return {
    name,
    state: "completed",
    latency: { ...statistics },
    throughput: { ...statistics },
    period: 0,
    totalTime: 0,
    runtime: "node",
    runtimeVersion: process.versions.node,
    timestampProviderName: "codspeed",
  };
}

/**
 * The CodSpeed benchmark provider. Two modes:
 * - analysis (instrumentation/simulation): CodSpeed runs each fn itself under a
 *   tight instrument window and returns zeroed-but-valid results — the real
 *   measurement is captured by the instrument, not returned here.
 * - walltime: tinybench drives the measured loop; CodSpeed brackets it with the
 *   instrument window and converts each task's stats into a result.
 */
const provider: BenchmarkProvider = {
  async run({ test, registrations, options }): Promise<BenchResult[]> {
    // Resolve the URI up front, outside any measured window — it walks the
    // filesystem (git root lookup), which must not land inside a sample.
    const groupUri = buildGroupUri(test);
    const getUri = (name: string) => `${groupUri}::${name}`;

    if (isWalltime) {
      return runWalltime(registrations, options, getUri, test);
    }
    return runAnalysis(registrations, getUri);
  },
};

async function runAnalysis(
  registrations: BenchRegistrationInput[],
  getUri: (name: string) => string,
): Promise<BenchResult[]> {
  const label = InstrumentHooks.isInstrumented() ? "Measured" : "Checked";
  const results: BenchResult[] = [];
  for (const { name, fn, fnOpts } of registrations) {
    const uri = getUri(name);
    await runAnalysisTask(fn, fnOpts, uri);
    console.log(`[CodSpeed] ${label} ${uri}`);
    results.push(analysisResult(name));
  }
  return results;
}

/**
 * Run one benchmark under instrumentation: warm the JIT outside the window, then
 * bracket a single `fn()` call with `startBenchmark`/`stopBenchmark` under the
 * root frame, with the user hooks around it.
 *
 * Synchronous benchmarks get a fully synchronous window: awaiting a sync fn
 * would splice Node's promise-hook machinery above the root frame.
 */
async function runAnalysisTask(
  fn: BenchFn,
  fnOpts: TinybenchFnOptions | undefined,
  uri: string,
): Promise<void> {
  if (fn.constructor?.name === "AsyncFunction") {
    await fnOpts?.beforeAll?.("run");
    await optimizeFunction(async () => {
      await fnOpts?.beforeEach?.("run");
      await fn();
      await fnOpts?.afterEach?.("run");
    });

    await fnOpts?.beforeEach?.("run");
    global.gc?.();
    await wrapWithRootFrame(async () => {
      InstrumentHooks.startBenchmark();
      await fn();
      InstrumentHooks.stopBenchmark();
      InstrumentHooks.setExecutedBenchmark(process.pid, uri);
    })();
    await fnOpts?.afterEach?.("run");
    await fnOpts?.afterAll?.("run");
    return;
  }

  fnOpts?.beforeAll?.("run");
  optimizeFunctionSync(() => {
    fnOpts?.beforeEach?.("run");
    fn();
    fnOpts?.afterEach?.("run");
  });

  fnOpts?.beforeEach?.("run");
  global.gc?.();
  wrapWithRootFrameSync(() => {
    InstrumentHooks.startBenchmark();
    fn();
    InstrumentHooks.stopBenchmark();
    InstrumentHooks.setExecutedBenchmark(process.pid, uri);
  })();
  fnOpts?.afterEach?.("run");
  fnOpts?.afterAll?.("run");
}

async function runWalltime(
  registrations: BenchRegistrationInput[],
  options: BenchRunOptions | undefined,
  getUri: (name: string) => string,
  test: BenchmarkGroup["test"],
): Promise<BenchResult[]> {
  const { Bench } = await importHostTinybench();
  const bench = new Bench({
    signal: test.context.signal,
    ...options,
    // walltime needs per-iteration samples to compute quantiles
    retainSamples: true,
  });

  for (const { name, fn, fnOpts } of registrations) {
    // tinybench v6 keeps `fn` private, so the root frame is baked in here
    bench.add(
      name,
      wrapWithRootFrame(() => fn()),
      fnOpts,
    );
  }

  installInstrumentHooks(bench, getUri);
  const tasks = await bench.run();

  throwOnErroredTasks(tasks);
  collectWalltimeResults(bench, getUri);

  return tasks.map(tinybenchTaskToBenchResult);
}

/**
 * Surface benchmark failures the way Vitest's own provider does: a single error
 * is rethrown as is, several are aggregated, and the test fails instead of
 * reporting empty results.
 */
function throwOnErroredTasks(tasks: TinybenchTask[]): void {
  const errors = tasks
    .filter((task) => task.result?.state === "errored")
    .map((task) => task.result?.error);
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Some benchmarks failed");
  }
}

function collectWalltimeResults(
  bench: TinybenchWithTasks,
  getUri: (name: string) => string,
): void {
  const options: TinybenchOptions = {
    time: bench.time,
    iterations: bench.iterations,
    // A bench with warmup turned off keeps its warmup timings, so they'd
    // otherwise be reported as if a warmup had run.
    warmupTime: bench.warmup ? bench.warmupTime : 0,
    warmupIterations: bench.warmup ? bench.warmupIterations : 0,
  };
  const benchmarks: Benchmark[] = [];
  for (const task of bench.tasks) {
    if (task.result?.state !== "completed") continue;
    const benchmark = tinybenchTaskToBenchmark(
      task,
      getUri(task.name),
      options,
    );
    if (benchmark) {
      benchmarks.push(benchmark);
    }
  }
  writeAndLogWalltimeResults(benchmarks);
}

function tinybenchTaskToBenchResult(task: TinybenchTask): BenchResult {
  const result = task.result;
  if (result?.state !== "completed") {
    throw new Error(
      `[CodSpeed] benchmark "${task.name}" did not complete: received "${result?.state ?? "no result"}"`,
    );
  }
  // tinybench's completed result already carries the full statistics surface
  // Vitest serializes; pass it through, keyed by the task name.
  return {
    ...(result as unknown as Omit<BenchResult, "name">),
    name: task.name,
  };
}

export default provider;
