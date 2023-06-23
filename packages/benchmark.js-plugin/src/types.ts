import Benchmark, { Options } from "benchmark";

export interface CodSpeedBenchOptions extends Options {
  uri: string;
}

export interface CodSpeedBenchmark extends Benchmark {
  uri: string;
}
