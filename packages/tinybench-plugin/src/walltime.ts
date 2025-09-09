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

declare const __VERSION__: string;

class CodespeedFrame {
  public readonly suffix: string;
  public readonly id: number;
  public readonly timestamp: number;
  public readonly methodName: string;

  constructor(suffix: string) {
    this.suffix = this.sanitizeIdentifier(suffix);
    this.id = Math.random();
    this.timestamp = Date.now();

    const methodName = `__codspeed_root_frame__${this.suffix}`;
    this.methodName = methodName;

    // Create a named function dynamically using eval
    const functionBody = `
      async function ${methodName}() {
        InstrumentHooks.startBenchmark();
        const result = await task.run();
        InstrumentHooks.stopBenchmark();
        return result;
      }
      return ${methodName};
    `;

    // Type assertion to tell TypeScript about the dynamic method
    (this as any)[methodName] = eval(`(${functionBody})`);
  }

  private sanitizeIdentifier(input: string): string {
    return (
      input
        // Replace invalid characters with underscores
        .replace(/[^a-zA-Z0-9_$]/g, "_")
        // Ensure it doesn't start with a number
        .replace(/^[0-9]/, "_$&")
        // Collapse multiple underscores
        .replace(/_+/g, "_")
        // Remove trailing underscores
        .replace(/_+$/, "") ||
      // Ensure it's not empty
      "_default"
    );
  }

  async call(): Promise<any> {
    return await (this as any)[this.methodName]();
  }

  // Get the actual function for direct calling
  getFunction(): () => Promise<any> {
    return (this as any)[this.methodName];
  }
}

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
      const frame = new CodespeedFrame(uri);
      const taskResult = await frame.call();
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
