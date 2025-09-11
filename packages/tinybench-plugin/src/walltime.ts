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
import { Bench, TaskResult } from "tinybench";
import { getTaskUri } from "./uri";
import { invariant, isPromiseLike } from "./utils";

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

    // Run the bench naturally to collect TaskResult data
    const results = [];

    // Collect and report walltime data
    for (const task of bench.tasks) {
      const uri = getTaskUri(bench, task.name, rootCallingFile);

      // run the warmup of the task right before its actual run
      if (bench.opts.warmup) {
        await task.warmup();
      }
      await mongoMeasurement.start(uri);
      InstrumentHooks.startBenchmark();
      const taskResult = await InstrumentHooks.__codspeed_root_frame__(() =>
        task.run()
      );
      // const taskResult = await task.run();
      InstrumentHooks.stopBenchmark();
      await mongoMeasurement.stop(uri);
      results.push(taskResult);

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

    return results;
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

    // Override the Task benchmark method for walltime mode
    if (bench.tasks.length > 0) {
      const TaskClass = bench.tasks[0].constructor as any;
      // const originalBenchmark = TaskClass.prototype.benchmark;

      TaskClass.prototype.benchmarkSync = function (
        mode: string,
        time: number,
        iterations: number
      ) {
        if (this.fnOpts.beforeAll != null) {
          try {
            const beforeAllResult = this.fnOpts.beforeAll.call(this, mode);
            invariant(
              !isPromiseLike(beforeAllResult),
              "`beforeAll` function must be sync when using `runSync()`"
            );
          } catch (error) {
            return { error };
          }
        }

        // TODO: factor out
        let totalTime = 0; // ms
        const samples: number[] = [];
        const benchmarkTask = () => {
          if (this.fnOpts.beforeEach != null) {
            const beforeEachResult = this.fnOpts.beforeEach.call(this, mode);
            invariant(
              !isPromiseLike(beforeEachResult),
              "`beforeEach` function must be sync when using `runSync()`"
            );
          }

          let taskTime = 0; // ms;

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const taskStart = this.bench.opts.now!();
          // eslint-disable-next-line no-useless-call
          const result = this.fn.call(this);
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          taskTime = this.bench.opts.now!() - taskStart;

          invariant(
            !isPromiseLike(result),
            "task function must be sync when using `runSync()`"
          );

          samples.push(taskTime);
          totalTime += taskTime;

          if (this.fnOpts.afterEach != null) {
            const afterEachResult = this.fnOpts.afterEach.call(this, mode);
            invariant(
              !isPromiseLike(afterEachResult),
              "`afterEach` function must be sync when using `runSync()`"
            );
          }
        };

        try {
          if (mode === "run") {
            InstrumentHooks.startBenchmark();
          }
          InstrumentHooks.__codspeed_root_frame__(() => {
            while (
              // eslint-disable-next-line no-unmodified-loop-condition
              totalTime < time ||
              samples.length < iterations
            ) {
              benchmarkTask();
            }
          });
          if (mode === "run") {
            InstrumentHooks.stopBenchmark();
          }
        } catch (error) {
          return { error };
        }

        if (this.fnOpts.afterAll != null) {
          try {
            const afterAllResult = this.fnOpts.afterAll.call(this, mode);
            invariant(
              !isPromiseLike(afterAllResult),
              "`afterAll` function must be sync when using `runSync()`"
            );
          } catch (error) {
            return { error };
          }
        }
        return { samples };
      };
    }

    // Run the bench naturally to collect TaskResult data
    const results = [];

    // Collect and report walltime data
    for (const task of bench.tasks) {
      const uri = getTaskUri(bench, task.name, rootCallingFile);

      // run the warmup of the task right before its actual run
      if (bench.opts.warmup) {
        task.warmup();
      }
      // await mongoMeasurement.start(uri);
      task.runSync();
      // const taskResult = await task.run();
      InstrumentHooks.stopBenchmark();
      // await mongoMeasurement.stop(uri);
      results.push(task);

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

    return results;
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
