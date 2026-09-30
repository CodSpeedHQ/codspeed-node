import { type Benchmark } from "@codspeed/core";
import { type RunnerTaskResult, type RunnerTestSuite } from "vitest";
import { tinybenchTaskToBenchmark, type TinybenchTask } from "../instrument";
import { isVitestTaskBenchmark } from "./common";
import { getBenchOptions, type BenchmarkTask } from "./compat";

export async function extractBenchmarkResults(
  suite: RunnerTestSuite,
  parentPath = "",
): Promise<Benchmark[]> {
  const benchmarks: Benchmark[] = [];
  const currentPath = parentPath ? `${parentPath}::${suite.name}` : suite.name;

  for (const task of suite.tasks) {
    if (task.type === "suite") {
      const nestedBenchmarks = await extractBenchmarkResults(task, currentPath);
      benchmarks.push(...nestedBenchmarks);
    } else if (isVitestTaskBenchmark(task) && task.result?.state === "pass") {
      const benchmark = processBenchmarkTask(task, currentPath);
      if (benchmark) {
        benchmarks.push(benchmark);
      }
    }
  }

  return benchmarks;
}

function processBenchmarkTask(
  task: BenchmarkTask,
  suitePath: string,
): Benchmark | null {
  const uri = `${suitePath}::${task.name}`;

  const result = task.result;
  if (!result) {
    console.warn(`    ⚠ No result data available for ${uri}`);
    return null;
  }

  try {
    const benchmark = tinybenchTaskToBenchmark(
      adaptLegacyResult(task.name, result),
      uri,
      getBenchOptions(task),
    );

    if (benchmark === null) {
      console.log(`    ✔ No walltime data to collect for ${uri}`);
      return null;
    }

    console.log(`    ✔ Collected walltime data for ${uri}`);
    return benchmark;
  } catch (error) {
    console.warn(`    ⚠ Failed to process benchmark result for ${uri}:`, error);
    return null;
  }
}

/** tinybench v2's flat statistics, which Vitest 3/4 stores under `result.benchmark`. */
interface LegacyBenchmarkStats {
  totalTime: number;
  min: number;
  max: number;
  mean: number;
  sd: number;
  samples: number[];
}

/**
 * Reshape a Vitest 3/4 result into the tinybench v6 form the shared converter
 * expects, which nests the statistics under `latency`.
 */
function adaptLegacyResult(
  name: string,
  result: RunnerTaskResult,
): TinybenchTask {
  // `result.benchmark` only exists on the Vitest 3/4 task result; the v5 typings
  // (compiled against here) dropped it.
  const benchmark = (result as { benchmark?: LegacyBenchmarkStats }).benchmark;
  if (!benchmark) {
    throw new Error("No benchmark data available in result");
  }

  return {
    name,
    result: {
      totalTime: benchmark.totalTime,
      latency: {
        min: benchmark.min,
        max: benchmark.max,
        mean: benchmark.mean,
        sd: benchmark.sd,
        samples: benchmark.samples,
      },
    },
  };
}
