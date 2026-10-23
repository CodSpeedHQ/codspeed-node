import {
  getGitDir,
  getInstrumentMode,
  getWalltimeForks,
  InstrumentHooks,
  isGcBetweenRoundsEnabled,
  Isolation,
  optimizeFunction,
  optimizeFunctionSync,
  setupCore,
  teardownCore,
  WALLTIME_FORKS_ENV,
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
  withGcAfter,
  writeAndLogWalltimeResults,
  type TinybenchBench,
  type TinybenchOptions,
  type TinybenchRoundHook,
  type TinybenchTask,
} from "../instrument";

interface TinybenchFnOptions {
  beforeAll?: (mode?: "run" | "warmup") => unknown;
  beforeEach?: (mode?: "run" | "warmup") => unknown;
  afterEach?: (mode?: "run" | "warmup") => unknown;
  afterAll?: (mode?: "run" | "warmup") => unknown;
}

type BenchFn = BenchRegistrationInput["fn"];

type BenchStatistics = BenchResult["latency"];

/** The timing fields are tinybench's resolved options, i.e. what the run used. */
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
 * Typed structurally: the plugin's own tinybench may be a different major than
 * the one the installed Vitest depends on.
 */
interface HostTinybench {
  Bench: new (options?: BenchRunOptions) => TinybenchWithTasks;
}

const isWalltime = getInstrumentMode() === "walltime";

// Vitest imports the provider once per worker. `setupCore()` truncates the perf
// map, so it must not run again per benchmark.
setupCore();
process.once("beforeExit", () => teardownCore());

/**
 * URI prefix shared by the benchmarks of a group, e.g.
 * `src/a.bench.ts::my suite::my test`. Each registration appends `::<name>`.
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

/** Results must match the shape of the tinybench Vitest itself depends on. */
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
 * Analysis mode runs each fn once under instrumentation and returns zeroed
 * results: the measurement is captured by the instrument. Walltime mode lets
 * tinybench drive the measured loop.
 */
const provider: BenchmarkProvider = {
  async run({ test, registrations, options }): Promise<BenchResult[]> {
    // The git root lookup hits the filesystem, so keep it out of any sample.
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
  const instrumented = InstrumentHooks.isInstrumented();
  const label = instrumented ? "Measured" : "Checked";
  // Without instrumentation nothing is measured, so there is nothing to isolate.
  const isolation = instrumented ? Isolation.current() : Isolation.shared();
  const results: BenchResult[] = [];
  for (const { name, fn, fnOpts } of registrations) {
    const uri = getUri(name);
    // An isolated child still reports every benchmark to Vitest, but it only
    // measures its own.
    if (isolation.shouldRun(uri)) {
      await isolation.run(uri, async () => {
        await runAnalysisTask(fn, fnOpts, uri);
        console.log(`[CodSpeed] ${label} ${uri}`);
      });
    }
    results.push(analysisResult(name));
  }
  return results;
}

/**
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
  if (getWalltimeForks() !== undefined) {
    throw new Error(
      `[CodSpeed] ${WALLTIME_FORKS_ENV} is not supported with Vitest 5 yet`,
    );
  }

  const gcBetweenRounds = isGcBetweenRoundsEnabled();
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
      gcBetweenRounds
        ? {
            ...fnOpts,
            // Vitest's FnHook is typed looser than tinybench's round hook
            beforeEach: withGcAfter(
              fnOpts?.beforeEach as TinybenchRoundHook | undefined,
            ) as TinybenchFnOptions["beforeEach"],
          }
        : fnOpts,
    );
  }

  installInstrumentHooks(bench, getUri);
  const tasks = await bench.run();

  throwOnErroredTasks(tasks);
  collectWalltimeResults(bench, getUri);

  return tasks.map(tinybenchTaskToBenchResult);
}

/** Fail the test like Vitest's own provider does, instead of returning empty results. */
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
  return {
    ...(result as unknown as Omit<BenchResult, "name">),
    name: task.name,
  };
}

export default provider;
