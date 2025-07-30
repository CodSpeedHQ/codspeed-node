import {
  calculateQuantiles,
  msToNs,
  msToS,
  writeWalltimeResults,
  type Benchmark,
  type BenchmarkStats,
} from "@codspeed/core";
import {
  type Benchmark as VitestBenchmark,
  type RunnerTaskResult,
  type RunnerTestSuite,
} from "vitest";
import { NodeBenchmarkRunner } from "vitest/runners";
import { getBenchOptions } from "vitest/suite";
import {
  isVitestTaskBenchmark,
  patchRootSuiteWithFullFilePath,
} from "./common";

declare const __VERSION__: string;

/**
 * WalltimeRunner uses Vitest's default benchmark execution
 * and extracts results from the suite after completion
 */
export class WalltimeRunner extends NodeBenchmarkRunner {
  async runSuite(suite: RunnerTestSuite): Promise<void> {
    patchRootSuiteWithFullFilePath(suite);

    console.log(
      `[CodSpeed] running with @codspeed/vitest-plugin v${__VERSION__} (walltime mode)`
    );

    // Let Vitest's default benchmark runner handle execution
    await super.runSuite(suite);

    // Extract benchmark results from the completed suite
    const benchmarks = await this.extractBenchmarkResults(suite);

    if (benchmarks.length > 0) {
      writeWalltimeResults(benchmarks);
      console.log(
        `[CodSpeed] Done collecting walltime data for ${benchmarks.length} benches.`
      );
    } else {
      console.warn(
        `[CodSpeed] No benchmark results found after suite execution`
      );
    }
  }

  private async extractBenchmarkResults(
    suite: RunnerTestSuite,
    parentPath = ""
  ): Promise<Benchmark[]> {
    const benchmarks: Benchmark[] = [];
    const currentPath = parentPath
      ? `${parentPath}::${suite.name}`
      : suite.name;

    for (const task of suite.tasks) {
      if (isVitestTaskBenchmark(task) && task.result?.state === "pass") {
        const benchmark = await this.processBenchmarkTask(task, currentPath);
        if (benchmark) {
          benchmarks.push(benchmark);
        }
      } else if (task.type === "suite") {
        const nestedBenchmarks = await this.extractBenchmarkResults(
          task,
          currentPath
        );
        benchmarks.push(...nestedBenchmarks);
      }
    }

    return benchmarks;
  }

  private async processBenchmarkTask(
    task: VitestBenchmark,
    suitePath: string
  ): Promise<Benchmark | null> {
    const uri = `${suitePath}::${task.name}`;

    const result = task.result;
    if (!result) {
      console.warn(`    ⚠ No result data available for ${uri}`);
      return null;
    }

    try {
      // Get tinybench configuration options from vitest
      const benchOptions = getBenchOptions(task);

      const stats = this.convertVitestResultToBenchmarkStats(
        result,
        benchOptions
      );

      if (stats === null) {
        console.log(`    ✔ No walltime data to collect for ${uri}`);
        return null;
      }

      const coreBenchmark: Benchmark = {
        name: task.name,
        uri,
        config: {
          max_rounds: benchOptions.iterations ?? null,
          max_time_ns: benchOptions.time ? msToNs(benchOptions.time) : null,
          min_round_time_ns: null, // tinybench does not have an option for this
          warmup_time_ns:
            benchOptions.warmupIterations !== 0 && benchOptions.warmupTime
              ? msToNs(benchOptions.warmupTime)
              : null,
        },
        stats,
      };

      console.log(`    ✔ Collected walltime data for ${uri}`);
      return coreBenchmark;
    } catch (error) {
      console.warn(
        `    ⚠ Failed to process benchmark result for ${uri}:`,
        error
      );
      return null;
    }
  }

  private convertVitestResultToBenchmarkStats(
    result: RunnerTaskResult,
    benchOptions: {
      time?: number;
      warmupTime?: number;
      warmupIterations?: number;
      iterations?: number;
    }
  ): BenchmarkStats | null {
    const benchmark = result.benchmark;

    if (!benchmark) {
      throw new Error("No benchmark data available in result");
    }

    const { totalTime, min, max, mean, sd, samples } = benchmark;

    // Get individual sample times in nanoseconds and sort them
    const sortedTimesNs = samples.map(msToNs).sort((a, b) => a - b);
    const meanNs = msToNs(mean);
    const stdevNs = msToNs(sd);

    if (sortedTimesNs.length == 0) {
      // Sometimes the benchmarks can be completely optimized out and not even run, but its beforeEach and afterEach hooks are still executed, and the task is still considered a success.
      // This is the case for the hooks.bench.ts example in this package
      return null;
    }

    const {
      q1_ns,
      q3_ns,
      median_ns,
      iqr_outlier_rounds,
      stdev_outlier_rounds,
    } = calculateQuantiles({ meanNs, stdevNs, sortedTimesNs });

    return {
      min_ns: msToNs(min),
      max_ns: msToNs(max),
      mean_ns: meanNs,
      stdev_ns: stdevNs,
      q1_ns,
      median_ns,
      q3_ns,
      total_time: msToS(totalTime),
      iter_per_round: 1, // as there is only one round in tinybench, we define that there were n rounds of 1 iteration
      rounds: sortedTimesNs.length,
      iqr_outlier_rounds,
      stdev_outlier_rounds,
      warmup_iters: benchOptions.warmupIterations ?? 0,
    };
  }
}

export default WalltimeRunner;
