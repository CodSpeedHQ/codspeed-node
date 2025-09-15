import {
  calculateQuantiles,
  InstrumentHooks,
  mongoMeasurement,
  msToNs,
  msToS,
  writeWalltimeResults,
  type Benchmark as CodspeedBenchmark,
  type BenchmarkStats,
} from "@codspeed/core";
import { Bench, Fn, Task, TaskResult } from "tinybench";
import { getTaskUri } from "./uri";

declare const __VERSION__: string;

export function runWalltimeBench(bench: Bench, rootCallingFile: string): void {
  bench.run = async () => {
    logStart();
    const codspeedBenchmarks: CodspeedBenchmark[] = [];

    // Collect and report walltime data
    for (const task of bench.tasks) {
      const uri = getTaskUri(bench, task.name, rootCallingFile);

      // Override the function under test to add a static frame
      wrapTaskFunction(task, true);

      // run the warmup of the task right before its actual run
      if (bench.opts.warmup) {
        await task.warmup();
      }

      await mongoMeasurement.start(uri);
      InstrumentHooks.startBenchmark();
      await task.run();
      InstrumentHooks.stopBenchmark();
      await mongoMeasurement.stop(uri);

      registerCodspeedBenchmarkFromTask(
        codspeedBenchmarks,
        task,
        bench,
        rootCallingFile
      );
    }

    return finalizeWalltimeRun(bench, codspeedBenchmarks, true);
  };

  bench.runSync = () => {
    logStart();
    const codspeedBenchmarks: CodspeedBenchmark[] = [];

    for (const task of bench.tasks) {
      // Override the function under test to add a static frame
      wrapTaskFunction(task, false);

      if (bench.opts.warmup) {
        task.warmup();
      }

      InstrumentHooks.startBenchmark();
      task.runSync();
      InstrumentHooks.stopBenchmark();

      registerCodspeedBenchmarkFromTask(
        codspeedBenchmarks,
        task,
        bench,
        rootCallingFile
      );
    }

    return finalizeWalltimeRun(bench, codspeedBenchmarks, false);
  };
}

function logStart() {
  console.log(
    `[CodSpeed] running with @codspeed/tinybench v${__VERSION__} (walltime mode)`
  );
}

const TINYBENCH_WARMUP_DEFAULT = 16;

function registerCodspeedBenchmarkFromTask(
  codspeedBenchmarks: CodspeedBenchmark[],
  task: Task,
  bench: Bench,
  rootCallingFile: string
): void {
  const uri = getTaskUri(bench, task.name, rootCallingFile);

  if (!task.result) {
    console.warn(`    ⚠ No result data available for ${uri}`);
    return;
  }

  const warmupIterations = bench.opts.warmup
    ? bench.opts.warmupIterations ?? TINYBENCH_WARMUP_DEFAULT
    : 0;
  const stats = convertTinybenchResultToBenchmarkStats(
    task.result,
    warmupIterations
  );

  codspeedBenchmarks.push({
    name: task.name,
    uri,
    config: {
      max_rounds: bench.opts.iterations ?? null,
      max_time_ns: bench.opts.time ? msToNs(bench.opts.time) : null,
      min_round_time_ns: null, // tinybench does not have an option for this
      warmup_time_ns:
        bench.opts.warmup && bench.opts.warmupTime
          ? msToNs(bench.opts.warmupTime)
          : null,
    },
    stats,
  });

  console.log(`    ✔ Collected walltime data for ${uri}`);
  InstrumentHooks.setExecutedBenchmark(process.pid, uri);
}

function wrapTaskFunction(task: Task, isAsync: boolean): void {
  const { fn } = task as unknown as { fn: Fn };
  if (isAsync) {
    // eslint-disable-next-line no-inner-declarations
    async function __codspeed_root_frame__() {
      await fn();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (task as any).fn = __codspeed_root_frame__;
  } else {
    // eslint-disable-next-line no-inner-declarations
    function __codspeed_root_frame__() {
      fn();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (task as any).fn = __codspeed_root_frame__;
  }
}

function finalizeWalltimeRun(
  bench: Bench,
  benchmarks: CodspeedBenchmark[],
  isAsync: boolean
) {
  // Write results to JSON file using core function
  if (benchmarks.length > 0) {
    writeWalltimeResults(benchmarks, isAsync);
  }

  console.log(
    `[CodSpeed] Done collecting walltime data for ${bench.tasks.length} benches.`
  );
  return bench.tasks;
}

function convertTinybenchResultToBenchmarkStats(
  result: TaskResult,
  warmupIterations: number
): BenchmarkStats {
  const { min, max, mean, sd, samples } = result.latency;

  // Get individual sample times in nanoseconds and sort them
  const sortedTimesNs = samples.map(msToNs).sort((a, b) => a - b);
  const meanNs = msToNs(mean);
  const stdevNs = msToNs(sd);

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
    total_time: msToS(result.totalTime),
    iter_per_round: 1, // as there is only one round in tinybench, we define that there were n rounds of 1 iteration
    rounds: sortedTimesNs.length,
    iqr_outlier_rounds,
    stdev_outlier_rounds,
    warmup_iters: warmupIterations,
  };
}
