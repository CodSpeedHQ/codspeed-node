import {
  bench as vitestBench,
  BenchFunction,
  BenchmarkAPI,
  BenchOptions,
  Reporter,
} from "vitest/";
import { createChainable } from "./chainable";

const noop = () => {};

function createBenchmark(
  fn: (
    this: Record<"skip" | "only" | "todo", boolean | undefined>,
    name: string,
    fn?: BenchFunction,
    options?: BenchOptions
  ) => void
) {
  const benchmark = createChainable(
    ["skip", "only", "todo"],
    fn
  ) as BenchmarkAPI;

  benchmark.skipIf = (condition: any) =>
    (condition ? benchmark.skip : benchmark) as BenchmarkAPI;
  benchmark.runIf = (condition: any) =>
    (condition ? benchmark : benchmark.skip) as BenchmarkAPI;

  return benchmark as BenchmarkAPI;
}

export const bench = createBenchmark(function (
  name,
  fn: BenchFunction = noop,
  options: BenchOptions = {}
) {
  console.log("Hello " + name);
});
