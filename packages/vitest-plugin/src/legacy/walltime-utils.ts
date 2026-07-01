import { type Benchmark } from "@codspeed/core";
import {
  type RunnerTaskResult,
  type RunnerTestSuite,
  type Benchmark as VitestBenchmark,
} from "vitest";
// `vitest/suite` only exists on Vitest 3/4; this module is used only there.
// eslint-disable-next-line import/no-unresolved
import { getBenchOptions } from "vitest/suite";
import {
  tinybenchTaskToBenchmark,
  type TinybenchOptions,
  type TinybenchTask,
} from "../instrument";
import { isVitestTaskBenchmark } from "./common";

export async function extractBenchmarkResults(
  suite: RunnerTestSuite,
  parentPath = "",
): Promise<Benchmark[]> {
  const benchmarks: Benchmark[] = [];
  const currentPath = parentPath ? `${parentPath}::${suite.name}` : suite.name;

  for (const task of suite.tasks) {
    if (isVitestTaskBenchmark(task) && task.result?.state === "pass") {
      const benchmark = processBenchmarkTask(task, currentPath);
      if (benchmark) {
        benchmarks.push(benchmark);
      }
    } else if (task.type === "suite") {
      const nestedBenchmarks = await extractBenchmarkResults(task, currentPath);
      benchmarks.push(...nestedBenchmarks);
    }
  }

  return benchmarks;
}

function processBenchmarkTask(
  task: VitestBenchmark,
  suitePath: string,
): Benchmark | null {
  const uri = `${suitePath}::${task.name}`;

  const result = task.result;
  if (!result) {
    console.warn(`    ⚠ No result data available for ${uri}`);
    return null;
  }

  try {
    const benchOptions = getBenchOptions(task);
    const benchmark = tinybenchTaskToBenchmark(
      adaptLegacyResult(task.name, result),
      uri,
      benchOptions as TinybenchOptions,
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

/**
 * Vitest 3/4 attaches the raw tinybench v2 result under `result.benchmark`,
 * whose statistics are a flat object ({ totalTime, min, max, mean, sd, samples }).
 * Reshape it into the `{ result: { totalTime, latency } }` form the shared
 * converter expects (tinybench v6 nests statistics under `latency`).
 */
interface LegacyBenchmarkStats {
  totalTime: number;
  min: number;
  max: number;
  mean: number;
  sd: number;
  samples: number[];
}

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
    fn: () => undefined,
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
