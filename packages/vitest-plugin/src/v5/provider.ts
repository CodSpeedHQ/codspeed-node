import {
  getGitDir,
  getInstrumentMode,
  InstrumentHooks,
  walltimeIsolation,
  optimizeFunction,
  optimizeFunctionSync,
  resolveWalltimeForks,
  runForks,
  samplesToResult,
  setupCore,
  teardownCore,
  wrapWithRootFrame,
  wrapWithRootFrameSync,
  writeForkSamples,
  type Benchmark,
  type WalltimeOptions,
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
  getPluginForks,
  installInstrumentHooks,
  tinybenchTaskToBenchmark,
  writeAndLogWalltimeResults,
  type TinybenchBench,
  type TinybenchOptions,
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
  const mode = walltimeIsolation();
  if (mode.kind === "Forks") {
    return runForkParent(registrations, options, getUri);
  }
  // A fork measures only its benchmark; Vitest still gets every result.
  const measured = registrations.filter(
    ({ name }) => mode.kind !== "Fork" || mode.uri === getUri(name),
  );

  const { Bench } = await importHostTinybench();
  const bench = new Bench({
    signal: test.context.signal,
    ...options,
    // walltime needs per-iteration samples to compute quantiles
    retainSamples: true,
  });

  for (const { name, fn, fnOpts } of measured) {
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
  if (mode.kind === "Fork") {
    for (const task of tasks) {
      writeForkSamples(mode.samplesFile, [
        ...(task.result?.latency.samples ?? []),
      ]);
    }
  } else {
    collectWalltimeResults(bench, getUri);
  }

  const results = new Map(
    tasks.map((task) => [task.name, tinybenchTaskToBenchResult(task)]),
  );
  return registrations.map(
    ({ name }) => results.get(name) ?? analysisResult(name),
  );
}

/**
 * Measures every benchmark in fresh processes and reports their pooled
 * rounds. Vitest gets zeroed results, like in analysis mode.
 */
async function runForkParent(
  registrations: BenchRegistrationInput[],
  options: BenchRunOptions | undefined,
  getUri: (name: string) => string,
): Promise<BenchResult[]> {
  const { Bench } = await importHostTinybench();
  // Never run: it resolves tinybench's defaults for the reported config.
  const bench = new Bench(options);
  const benchmarks: Benchmark[] = [];
  for (const { name, fnOpts } of registrations) {
    const uri = getUri(name);
    const forks = resolveWalltimeForks(
      (fnOpts as WalltimeOptions | undefined)?.forks ??
        (options as WalltimeOptions | undefined)?.forks ??
        getPluginForks(),
    );
    const samples = await runForks(uri, forks);
    const benchmark = tinybenchTaskToBenchmark(
      { name, result: samplesToResult(samples) },
      uri,
      resolvedOptions(bench),
    );
    if (benchmark) {
      benchmarks.push(benchmark);
    }
  }
  writeAndLogWalltimeResults(benchmarks);
  return registrations.map(({ name }) => analysisResult(name));
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

/** The options the bench runs with, as reported to CodSpeed. */
function resolvedOptions(bench: TinybenchWithTasks): TinybenchOptions {
  return {
    time: bench.time,
    iterations: bench.iterations,
    // A bench with warmup turned off keeps its warmup timings, so they'd
    // otherwise be reported as if a warmup had run.
    warmupTime: bench.warmup ? bench.warmupTime : 0,
    warmupIterations: bench.warmup ? bench.warmupIterations : 0,
  };
}

function collectWalltimeResults(
  bench: TinybenchWithTasks,
  getUri: (name: string) => string,
): void {
  const options = resolvedOptions(bench);
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
