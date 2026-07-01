import {
  calculateQuantiles,
  InstrumentHooks,
  MARKER_TYPE_BENCHMARK_END,
  MARKER_TYPE_BENCHMARK_START,
  msToNs,
  msToS,
  wrapWithRootFrame,
  writeWalltimeResults,
  type Benchmark,
  type BenchmarkStats,
} from "@codspeed/core";
import type * as tinybench from "tinybench";

export type Tinybench = typeof tinybench;

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

/** The minimal task shape `patchTaskRunWithRootFrame` mutates. */
interface RunnableTask {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => any;
}

/** The tinybench Task prototype whose `run` we wrap. */
interface TinybenchTaskClass {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prototype: { run: (this: any) => Promise<unknown> };
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

let isTaskPatched = false;

/**
 * The window bracketing the currently running task's measured loop, driven by
 * the setup/teardown hooks below. Tasks run strictly sequentially within a
 * worker, so one shared value suffices.
 */
const instrumentWindow: InstrumentWindow = { runStart: null };

/**
 * Wrap every task's fn with the root frame so collected stacks are attributed to
 * a benchmark. Idempotent: patching the shared `Task.prototype.run` in place hits
 * every Bench instance, so repeat calls are no-ops.
 *
 * `TaskClass` must be the exact prototype the host constructed its tasks against
 * (taken from a live task, not imported) so the patch applies even when multiple
 * copies of tinybench are installed.
 */
export function patchTaskRunOnce(TaskClass: TinybenchTaskClass): void {
  if (isTaskPatched) {
    return;
  }
  isTaskPatched = true;

  const originalRun = TaskClass.prototype.run;
  TaskClass.prototype.run = async function (this: RunnableTask) {
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
  const runEnd = InstrumentHooks.currentTimestamp();
  const pid = process.pid;

  // Benchmark markers must land inside the sample window opened by
  // startBenchmark(), so they have to be emitted before stopBenchmark()
  // closes it. The runner consumes the FIFO stream in order, so a marker
  // sent after StopBenchmark falls outside the sample and breaks the
  // expected SampleStart > BenchmarkStart > BenchmarkEnd > SampleEnd nesting.
  InstrumentHooks.addMarker(
    pid,
    MARKER_TYPE_BENCHMARK_START,
    instrumentWindow.runStart!,
  );
  InstrumentHooks.addMarker(pid, MARKER_TYPE_BENCHMARK_END, runEnd);

  InstrumentHooks.stopBenchmark();
  InstrumentHooks.setExecutedBenchmark(pid, uri);
  instrumentWindow.runStart = null;
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
