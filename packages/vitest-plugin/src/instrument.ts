import {
  calculateQuantiles,
  InstrumentHooks,
  MARKER_TYPE_BENCHMARK_END,
  MARKER_TYPE_BENCHMARK_START,
  msToNs,
  msToS,
  optimizeFunction,
  optimizeFunctionSync,
  wrapWithRootFrame,
  wrapWithRootFrameSync,
  writeWalltimeResults,
  type Benchmark,
  type BenchmarkStats,
} from "@codspeed/core";
import type * as tinybench from "tinybench";

export type Tinybench = typeof tinybench;

/** tinybench's per-task lifecycle hooks (a subset of `FnOptions`). */
export interface TinybenchFnOptions {
  beforeAll?: (mode?: "run" | "warmup") => unknown;
  beforeEach?: (mode?: "run" | "warmup") => unknown;
  afterEach?: (mode?: "run" | "warmup") => unknown;
  afterAll?: (mode?: "run" | "warmup") => unknown;
}

/** The captured registration for a task: its fn and options. */
export interface CapturedTask {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => any;
  fnOpts?: TinybenchFnOptions;
}

/** A tinybench task, exposing the `fn` the runner wraps with the root frame. */
export interface TinybenchTask {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => any;
  result?: TinybenchTaskResult;
}

/** tinybench's per-task setup/teardown hook signature. */
export type TinybenchHook = (
  task: TinybenchTask,
  mode: "run" | "warmup",
) => Promise<void> | void;

/** The mutable subset of a tinybench Bench the runner reaches into. */
export interface TinybenchBench {
  setup: TinybenchHook;
  teardown: TinybenchHook;
}


/**
 * The tinybench statistics shape (latency/throughput) shared across the v2 and
 * v6 lines. Only the fields the conversion needs are modeled.
 */
interface TinybenchStatistics {
  min: number;
  max: number;
  mean: number;
  sd: number;
  samples: number[] | undefined;
}

interface TinybenchTaskResult {
  state?: string;
  totalTime: number;
  latency: TinybenchStatistics;
}

/** The subset of tinybench bench options that maps onto a CodSpeed benchmark config. */
export interface TinybenchOptions {
  time?: number;
  warmupTime?: number;
  warmupIterations?: number;
  iterations?: number;
}

/** Timestamp marking the open edge of a task's measured loop. */
interface InstrumentWindow {
  runStart: bigint | null;
}

let isBenchAddPatched = false;

/**
 * The window bracketing the currently running task's measured loop, driven by
 * the setup/teardown hooks below. Tasks run strictly sequentially within a
 * worker, so one shared value suffices.
 */
const instrumentWindow: InstrumentWindow = { runStart: null };

// tinybench keeps a task's fn and options as `#private` fields (v6+), so we
// capture them ourselves when `Bench.add` runs, keyed by bench then task name.
// The analysis seam needs the raw fn to run it under its own tight window
// instead of tinybench's timing loop.
const capturedTasks = new WeakMap<object, Map<string, CapturedTask>>();

/** The minimal tinybench Bench prototype we patch to capture registrations. */
interface TinybenchBenchClass {
  prototype: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    add: (...args: any[]) => unknown;
  };
}

/**
 * Patch `Bench.prototype.add` to record each task's fn and options, keyed by
 * bench then task name. Idempotent, and applied to the prototype so it captures
 * registrations on every Bench the host constructs.
 *
 * `BenchClass` must be the exact class the host instantiates. In tinybench v6 a
 * task's fn is a true `#private` field — it cannot be read or replaced on the
 * task afterwards — so capturing (and, for walltime, root-frame-wrapping) has to
 * happen here, as the fn is registered.
 *
 * `registerFn` transforms the fn actually handed to tinybench: identity for
 * analysis (which runs the captured fn itself), or a root-frame wrap for
 * walltime (where tinybench drives the fn and the frame must already be baked
 * in).
 */
export function captureBenchAddOnce(
  BenchClass: TinybenchBenchClass,
  registerFn: (fn: CapturedTask["fn"]) => CapturedTask["fn"],
): void {
  if (isBenchAddPatched) {
    return;
  }
  isBenchAddPatched = true;

  const originalAdd = BenchClass.prototype.add;
  BenchClass.prototype.add = function (
    this: object,
    name: string,
    fn: CapturedTask["fn"],
    fnOpts?: TinybenchFnOptions,
  ) {
    let byName = capturedTasks.get(this);
    if (!byName) {
      byName = new Map<string, CapturedTask>();
      capturedTasks.set(this, byName);
    }
    byName.set(name, { fn, fnOpts });
    return originalAdd.call(this, name, registerFn(fn), fnOpts);
  };
}

/** Retrieve the fn/options captured for a task on a given bench, if any. */
export function getCapturedTask(
  bench: object,
  taskName: string,
): CapturedTask | undefined {
  return capturedTasks.get(bench)?.get(taskName);
}

/** The tinybench Task prototype whose `run` the legacy seam wraps. */
interface TinybenchTaskClass {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prototype: { run: (this: any) => Promise<unknown> };
}

let isTaskPatched = false;

/**
 * Wrap every task's fn with the root frame by patching `Task.prototype.run` in
 * place. Used only by the legacy (Vitest 3/4) walltime seam, which runs on
 * tinybench v2 where a task's `fn` is a plain, reassignable property.
 *
 * The Vitest 5 seam cannot use this: tinybench v6 made `fn` a true `#private`
 * field, so reassigning `task.fn` is a silent no-op there — the frame must be
 * baked in at registration time instead (see rootFrameRegisterFn).
 */
export function patchTaskRunOnce(TaskClass: TinybenchTaskClass): void {
  if (isTaskPatched) {
    return;
  }
  isTaskPatched = true;

  const originalRun = TaskClass.prototype.run;
  TaskClass.prototype.run = async function (this: CapturedTask) {
    const originalFn = this.fn;
    this.fn = wrapWithRootFrame(() => originalFn.call(this));

    try {
      return await originalRun.call(this);
    } finally {
      this.fn = originalFn;
    }
  };
}

/**
 * The root-frame wrap to hand tinybench at registration time (walltime, v5).
 * Post-hoc assignment to a task's `fn` is a no-op on tinybench v6 (private
 * field), so the frame must be baked into the registered fn instead.
 */
export function rootFrameRegisterFn(
  fn: CapturedTask["fn"],
): CapturedTask["fn"] {
  return wrapWithRootFrame(() => fn());
}

/** Identity registration: analysis runs the captured fn itself, unwrapped. */
export function identityRegisterFn(fn: CapturedTask["fn"]): CapturedTask["fn"] {
  return fn;
}

/**
 * Run one benchmark under instrumentation, matching the analysis window the
 * Vitest 3/4 runner uses exactly: warm the JIT with `optimizeFunction` outside
 * the window, run the user hooks around a single measured `fn()`, and bracket
 * only that call with `startBenchmark`/`stopBenchmark` under the root frame. The
 * measurement comes from the instrument, so no wall-clock markers are emitted
 * and tinybench's timing loop is not involved.
 *
 * Synchronous benchmarks run through a fully synchronous window
 * (`wrapWithRootFrameSync`, no `await`): awaiting a sync fn would splice Node's
 * promise-hook machinery in above the root frame and pollute the sample. Async
 * benchmarks necessarily use the awaited path.
 */
export async function runAnalysisTask(
  { fn, fnOpts }: CapturedTask,
  uri: string,
): Promise<void> {
  if (isAsyncFn(fn)) {
    await runAnalysisTaskAsync(fn, fnOpts, uri);
  } else {
    await runAnalysisTaskSync(fn, fnOpts, uri);
  }
}

function isAsyncFn(fn: CapturedTask["fn"]): boolean {
  return fn.constructor?.name === "AsyncFunction";
}

async function runAnalysisTaskAsync(
  fn: CapturedTask["fn"],
  fnOpts: TinybenchFnOptions | undefined,
  uri: string,
): Promise<void> {
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
}

function runAnalysisTaskSync(
  fn: CapturedTask["fn"],
  fnOpts: TinybenchFnOptions | undefined,
  uri: string,
): void {
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

/**
 * Drive the instrumentation window from each bench's run-mode setup/teardown
 * hooks so it brackets only tinybench's measured loop, excluding the warmup
 * that runs beforehand and the statistics computation tinybench performs after
 * the loop. Wrapping the whole `Task.run()` would otherwise fold all of that
 * framework overhead into the recorded sample.
 *
 * User-provided hooks are preserved and keep their order relative to the work
 * under test.
 */
export function installInstrumentHooks(
  bench: TinybenchBench,
  getUri: (taskName: string) => string,
): void {
  const userSetup = bench.setup;
  const userTeardown = bench.teardown;

  bench.setup = async (task, mode) => {
    await userSetup(task, mode);
    if (mode === "run") {
      InstrumentHooks.startBenchmark();
      instrumentWindow.runStart = InstrumentHooks.currentTimestamp();
    }
  };

  bench.teardown = async (task, mode) => {
    if (mode === "run") {
      closeInstrumentWindow(getUri(task.name));
    }
    await userTeardown(task, mode);
  };
}

function closeInstrumentWindow(uri: string): void {
  emitBenchmarkWindow(uri, instrumentWindow.runStart!);
  instrumentWindow.runStart = null;
}

/**
 * Close the currently open instrumentation window: emit the benchmark markers
 * bracketing [start, now], stop the benchmark, and attribute the sample to `uri`.
 *
 * Benchmark markers must land inside the sample window opened by
 * startBenchmark(), so they are emitted before stopBenchmark() closes it. The
 * runner consumes the FIFO stream in order, so a marker sent after stopBenchmark
 * would fall outside the sample and break the expected
 * SampleStart > BenchmarkStart > BenchmarkEnd > SampleEnd nesting.
 */
function emitBenchmarkWindow(uri: string, start: bigint): void {
  const end = InstrumentHooks.currentTimestamp();
  const pid = process.pid;

  InstrumentHooks.addMarker(pid, MARKER_TYPE_BENCHMARK_START, start);
  InstrumentHooks.addMarker(pid, MARKER_TYPE_BENCHMARK_END, end);

  InstrumentHooks.stopBenchmark();
  InstrumentHooks.setExecutedBenchmark(pid, uri);
}

/**
 * Persist collected walltime benchmarks, if any. The per-seam result traversal
 * differs (legacy walks the Vitest suite tree, v5 iterates the live tinybench
 * tasks) because each generation exposes results differently, but the write and
 * the summary log are identical.
 */
export function writeAndLogWalltimeResults(benchmarks: Benchmark[]): void {
  if (benchmarks.length === 0) {
    return;
  }
  writeWalltimeResults(benchmarks);
  console.log(
    `[CodSpeed] Done collecting walltime data for ${benchmarks.length} benches.`,
  );
}

/**
 * Convert a completed tinybench task into a CodSpeed walltime benchmark. Returns
 * null when the task produced no samples (e.g. fully optimized out), in which
 * case there is nothing to record.
 */
export function tinybenchTaskToBenchmark(
  task: TinybenchTask,
  uri: string,
  options: TinybenchOptions,
): Benchmark | null {
  const stats = tinybenchResultToStats(task.result, options);
  if (stats === null) {
    return null;
  }

  return {
    name: task.name,
    uri,
    config: {
      max_rounds: options.iterations ?? null,
      max_time_ns: options.time ? msToNs(options.time) : null,
      min_round_time_ns: null, // tinybench does not have an option for this
      warmup_time_ns:
        options.warmupIterations !== 0 && options.warmupTime
          ? msToNs(options.warmupTime)
          : null,
    },
    stats,
  };
}

function tinybenchResultToStats(
  result: TinybenchTaskResult | undefined,
  options: TinybenchOptions,
): BenchmarkStats | null {
  if (!result) {
    throw new Error("No benchmark data available in result");
  }

  const { totalTime, latency } = result;
  const { min, max, mean, sd, samples } = latency;

  const sortedTimesNs = (samples ?? []).map(msToNs).sort((a, b) => a - b);
  const meanNs = msToNs(mean);
  const stdevNs = msToNs(sd);

  if (sortedTimesNs.length == 0) {
    // Sometimes the benchmarks can be completely optimized out and not even
    // run, but their beforeEach and afterEach hooks are still executed, and the
    // task is still considered a success.
    return null;
  }

  const { q1_ns, q3_ns, median_ns, iqr_outlier_rounds, stdev_outlier_rounds } =
    calculateQuantiles({ meanNs, stdevNs, sortedTimesNs });

  return {
    min_ns: msToNs(min),
    max_ns: msToNs(max),
    mean_ns: meanNs,
    stdev_ns: stdevNs,
    q1_ns,
    median_ns,
    q3_ns,
    total_time: msToS(totalTime),
    iter_per_round: 1, // tinybench runs one iteration per round
    rounds: sortedTimesNs.length,
    iqr_outlier_rounds,
    stdev_outlier_rounds,
    warmup_iters: options.warmupIterations ?? 0,
  };
}
