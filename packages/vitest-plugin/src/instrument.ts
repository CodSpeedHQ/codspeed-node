import {
  calculateQuantiles,
  InstrumentHooks,
  MARKER_TYPE_BENCHMARK_END,
  MARKER_TYPE_BENCHMARK_START,
  msToNs,
  msToS,
  writeWalltimeResults,
  type Benchmark,
  type BenchmarkStats,
} from "@codspeed/core";
import type * as tinybench from "tinybench";

export type Tinybench = typeof tinybench;

export interface TinybenchTask {
  name: string;
  result?: TinybenchTaskResult;
}

export type TinybenchHook = (
  task: TinybenchTask,
  mode: "run" | "warmup",
) => Promise<void> | void;

export interface TinybenchBench {
  setup: TinybenchHook;
  teardown: TinybenchHook;
}

interface TinybenchStatistics {
  min: number;
  max: number;
  mean: number;
  sd: number;
  samples: number[] | undefined;
}

interface TinybenchTaskResult {
  state?: string;
  /** Set by tinybench when `state` is `"errored"`. */
  error?: Error;
  totalTime: number;
  latency: TinybenchStatistics;
}

export interface TinybenchOptions {
  time?: number;
  warmupTime?: number;
  warmupIterations?: number;
  iterations?: number;
}

/**
 * Drive the instrumentation window from each bench's run-mode setup/teardown
 * hooks so it brackets only tinybench's measured loop, excluding the warmup
 * before it and the statistics computation after it.
 */
export function installInstrumentHooks(
  bench: TinybenchBench,
  getUri: (taskName: string) => string,
): void {
  const userSetup = bench.setup;
  const userTeardown = bench.teardown;

  // Tasks of a bench run sequentially, so one window is open at a time.
  let runStart: bigint | null = null;

  bench.setup = async (task, mode) => {
    await userSetup(task, mode);
    if (mode === "run") {
      InstrumentHooks.startBenchmark();
      runStart = InstrumentHooks.currentTimestamp();
    }
  };

  bench.teardown = async (task, mode) => {
    if (mode === "run") {
      const pid = process.pid;
      // The markers must land inside the sample window, so they go out before
      // stopBenchmark(): one sent after it breaks the expected
      // SampleStart > BenchmarkStart > BenchmarkEnd > SampleEnd nesting.
      InstrumentHooks.addMarker(pid, MARKER_TYPE_BENCHMARK_START, runStart!);
      InstrumentHooks.addMarker(
        pid,
        MARKER_TYPE_BENCHMARK_END,
        InstrumentHooks.currentTimestamp(),
      );
      InstrumentHooks.stopBenchmark();
      InstrumentHooks.setExecutedBenchmark(pid, getUri(task.name));
      runStart = null;
    }
    await userTeardown(task, mode);
  };
}

export function writeAndLogWalltimeResults(benchmarks: Benchmark[]): void {
  if (benchmarks.length === 0) {
    return;
  }
  writeWalltimeResults(benchmarks);
  console.log(
    `[CodSpeed] Done collecting walltime data for ${benchmarks.length} benches.`,
  );
}

/** Returns null when the task recorded no samples. */
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
