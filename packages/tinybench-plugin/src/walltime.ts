import {
  createDefaultBenchmarkConfig,
  writeWalltimeResults,
  type Benchmark,
  type BenchmarkStats,
} from "@codspeed/core";
import { Bench, TaskResult } from "tinybench";
import { taskUriMap } from "./index";

declare const __VERSION__: string;

function getTaskUri(
  bench: Bench,
  taskName: string,
  rootCallingFile: string
): string {
  const uriMap = taskUriMap.get(bench);
  return uriMap?.get(taskName) || `${rootCallingFile}::${taskName}`;
}

// Constants matching pytest-codspeed
const IQR_OUTLIER_FACTOR = 1.5;
const STDEV_OUTLIER_FACTOR = 3;

function calculateQuantiles(sortedTimes: number[]): [number, number, number] {
  const n = sortedTimes.length;
  if (n === 0) return [0, 0, 0];
  if (n === 1) return [sortedTimes[0], sortedTimes[0], sortedTimes[0]];

  // Use same quantile calculation as Python's statistics.quantiles(n=4)
  const q1Index = (n - 1) * 0.25;
  const q2Index = (n - 1) * 0.5;
  const q3Index = (n - 1) * 0.75;

  const q1 = interpolateQuantile(sortedTimes, q1Index);
  const median = interpolateQuantile(sortedTimes, q2Index);
  const q3 = interpolateQuantile(sortedTimes, q3Index);

  return [q1, median, q3];
}

function interpolateQuantile(sortedArray: number[], index: number): number {
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);

  if (lowerIndex === upperIndex) {
    return sortedArray[lowerIndex];
  }

  const lowerValue = sortedArray[lowerIndex];
  const upperValue = sortedArray[upperIndex];
  const fraction = index - lowerIndex;

  return lowerValue + fraction * (upperValue - lowerValue);
}

function convertTinybenchResultToBenchmarkStats(
  result: TaskResult,
  warmupIterations: number
): BenchmarkStats {
  // All tinybench times are in milliseconds, convert to nanoseconds
  const ms_to_ns = (ms: number) => ms * 1_000_000;

  const { min, max, mean, sd, samples } = result.latency;

  // Get individual sample times in nanoseconds and sort them
  const timesNs = samples.map(ms_to_ns).sort((a, b) => a - b);
  const meanNs = ms_to_ns(mean);
  const stdevNs = ms_to_ns(sd);

  // Calculate quantiles (q1, median, q3)
  const [q1_ns, median_ns, q3_ns] = calculateQuantiles(timesNs);

  // Calculate outliers using same algorithm as pytest-codspeed
  const iqrNs = q3_ns - q1_ns;
  const iqr_outlier_rounds = timesNs.filter(
    (t) =>
      t < q1_ns - IQR_OUTLIER_FACTOR * iqrNs ||
      t > q3_ns + IQR_OUTLIER_FACTOR * iqrNs
  ).length;

  const stdev_outlier_rounds = timesNs.filter(
    (t) =>
      t < meanNs - STDEV_OUTLIER_FACTOR * stdevNs ||
      t > meanNs + STDEV_OUTLIER_FACTOR * stdevNs
  ).length;

  return {
    min_ns: ms_to_ns(min),
    max_ns: ms_to_ns(max),
    mean_ns: meanNs,
    stdev_ns: stdevNs,
    q1_ns,
    median_ns,
    q3_ns,
    total_time: result.totalTime / 1_000, // convert from ms to seconds
    iter_per_round: timesNs.length,
    rounds: 1, // Tinybench only runs one round
    iqr_outlier_rounds,
    stdev_outlier_rounds,
    warmup_iters: warmupIterations,
  };
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
    // TODO: Check warmup
    const results = await bench.run();

    // Collect and report walltime data
    for (const task of bench.tasks) {
      const uri = getTaskUri(bench, task.name, rootCallingFile);

      if (task.result) {
        // Convert tinybench result to BenchmarkStats format
        const stats = convertTinybenchResultToBenchmarkStats(
          task.result,
          0 // Warmup iterations not available in new tinybench API
        );

        // Create benchmark using core defaults
        const config = createDefaultBenchmarkConfig();

        const benchmark: Benchmark = {
          name: task.name,
          uri,
          config,
          stats,
        };

        benchmarks.push(benchmark);

        console.log(`    ✔ Collected walltime data for ${uri}`);
      } else {
        console.warn(`    ⚠ No result data available for ${uri}`);
      }
    }

    // Write results to JSON file using core function
    if (benchmarks.length > 0) {
      writeWalltimeResults(benchmarks, "@codspeed/tinybench-plugin");
    }

    console.log(
      `[CodSpeed] Done collecting walltime data for ${bench.tasks.length} benches.`
    );
    // Restore our custom run method
    bench.run = originalRun;

    return results;
  };
}
