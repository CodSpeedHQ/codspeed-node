import {
  calculateQuantiles,
  InstrumentHooks,
  mongoMeasurement,
  msToNs,
  msToS,
  writeWalltimeResults,
  type Benchmark,
  type BenchmarkStats,
} from "@codspeed/core";
import { Bench, Fn, TaskResult } from "tinybench";
import { getTaskUri } from "./uri";

declare const __VERSION__: string;

export function runWalltimeBench(bench: Bench, rootCallingFile: string): void {
  bench.run = async () => {
    console.log(
      `[CodSpeed] running with @codspeed/tinybench v${__VERSION__} (walltime mode)`
    );

    // Store the original run method before we override it
    const originalRun = bench.run;

    // Temporarily restore the original run to get actual benchmark results
    const benchProto = Object.getPrototypeOf(bench);
    const prototypeRun = benchProto.run;
    bench.run = prototypeRun;

    const benchmarks: Benchmark[] = [];

    // Collect and report walltime data
    for (const task of bench.tasks) {
      const uri = getTaskUri(bench, task.name, rootCallingFile);

      // Override the function under test to add a static frame
      const { fn } = task as unknown as { fn: Fn };
      async function __codspeed_root_frame__() {
        await fn();
      }
      (task as any).fn = __codspeed_root_frame__;

      // run the warmup of the task right before its actual run
      if (bench.opts.warmup) {
        await task.warmup();
      }

      await mongoMeasurement.start(uri);
      InstrumentHooks.startBenchmark();
      await task.run();
      InstrumentHooks.stopBenchmark();
      await mongoMeasurement.stop(uri);

      if (task.result) {
        // Convert tinybench result to BenchmarkStats format
        const stats = convertTinybenchResultToBenchmarkStats(
          task.result,
          bench.opts.warmup ? bench.opts.warmupIterations ?? 0 : 0
        );

        const benchmark: Benchmark = {
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
        };

        benchmarks.push(benchmark);
        console.log(`    ✔ Collected walltime data for ${uri}`);
        InstrumentHooks.setExecutedBenchmark(process.pid, uri);
      } else {
        console.warn(`    ⚠ No result data available for ${uri}`);
      }
    }

    // Write results to JSON file using core function
    if (benchmarks.length > 0) {
      writeWalltimeResults(benchmarks, true);
    }

    console.log(
      `[CodSpeed] Done collecting walltime data for ${bench.tasks.length} benches.`
    );
    // Restore our custom run method
    bench.run = originalRun;

    return bench.tasks;
  };

  bench.runSync = () => {
    console.log(
      `[CodSpeed] running with @codspeed/tinybench v${__VERSION__} (walltime mode)`
    );

    // Store the original run method before we override it
    const originalRun = bench.run;

    // Temporarily restore the original run to get actual benchmark results
    const benchProto = Object.getPrototypeOf(bench);
    const prototypeRun = benchProto.run;
    bench.run = prototypeRun;

    const benchmarks: Benchmark[] = [];

    // Collect and report walltime data
    for (const task of bench.tasks) {
      const uri = getTaskUri(bench, task.name, rootCallingFile);

      // run the warmup of the task right before its actual run
      if (bench.opts.warmup) {
        task.warmup();
      }

      // Override the function under test to add a static frame
      const { fn } = task as unknown as { fn: Fn };
      function __codspeed_root_frame__() {
        fn();
      }
      (task as any).fn = __codspeed_root_frame__;

      InstrumentHooks.startBenchmark();
      task.runSync();
      InstrumentHooks.stopBenchmark();

      if (task.result) {
        // Convert tinybench result to BenchmarkStats format
        const stats = convertTinybenchResultToBenchmarkStats(
          task.result,
          bench.opts.warmup ? bench.opts.warmupIterations ?? 0 : 0
        );

        const benchmark: Benchmark = {
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
        };

        benchmarks.push(benchmark);
        console.log(`    ✔ Collected walltime data for ${uri}`);
        InstrumentHooks.setExecutedBenchmark(process.pid, uri);
      } else {
        console.warn(`    ⚠ No result data available for ${uri}`);
      }
    }

    // Write results to JSON file using core function
    if (benchmarks.length > 0) {
      writeWalltimeResults(benchmarks);
    }

    console.log(
      `[CodSpeed] Done collecting walltime data for ${bench.tasks.length} benches.`
    );
    // Restore our custom run method
    bench.run = originalRun;

    return bench.tasks;
  };
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
