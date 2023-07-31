import {
  Measurement,
  mongoMeasurement,
  optimizeFunction,
  optimizeFunctionSync,
  setupCore,
  teardownCore,
} from "@codspeed/core";
import Benchmark from "benchmark";
import buildSuiteAdd from "./buildSuiteAdd";
import getCallingFile from "./getCallingFile";
import { CodSpeedBenchmark } from "./types";

declare const __VERSION__: string;

interface WithCodSpeedBenchmark
  extends Omit<
    Benchmark,
    "run" | "abort" | "clone" | "compare" | "emit" | "off" | "on" | "reset"
  > {
  abort(): WithCodSpeedBenchmark;
  clone(options: Benchmark.Options): WithCodSpeedBenchmark;
  compare(benchmark: Benchmark): number;
  off(
    type?: string,
    listener?: CallableFunction
  ): Benchmark | Promise<Benchmark>;
  off(types: string[]): WithCodSpeedBenchmark;
  on(type?: string, listener?: CallableFunction): WithCodSpeedBenchmark;
  on(types: string[]): WithCodSpeedBenchmark;
  reset(): WithCodSpeedBenchmark;
  // Makes run an async function
  run(options?: Benchmark.Options): Benchmark | Promise<Benchmark>;
}

export interface WithCodSpeedSuite
  extends Omit<
    Benchmark.Suite,
    | "run"
    | "abort"
    | "clone"
    | "compare"
    | "emit"
    | "off"
    | "on"
    | "reset"
    | "add"
    | "filter"
    | "each"
    | "forEach"
  > {
  abort(): WithCodSpeedSuite;
  add(
    name: string,
    fn: CallableFunction | string,
    options?: Benchmark.Options
  ): WithCodSpeedSuite;
  add(
    fn: CallableFunction | string,
    options?: Benchmark.Options
  ): WithCodSpeedSuite;
  add(name: string, options?: Benchmark.Options): WithCodSpeedSuite;
  add(options: Benchmark.Options): WithCodSpeedSuite;
  clone(options: Benchmark.Options): WithCodSpeedSuite;
  filter(callback: CallableFunction | string): WithCodSpeedSuite;
  off(type?: string, callback?: CallableFunction): WithCodSpeedSuite;
  off(types: string[]): WithCodSpeedSuite;
  on(type?: string, callback?: CallableFunction): WithCodSpeedSuite;
  on(types: string[]): WithCodSpeedSuite;
  reset(): WithCodSpeedSuite;
  each(callback: CallableFunction): WithCodSpeedSuite;
  forEach(callback: CallableFunction): WithCodSpeedSuite;

  run(options?: Benchmark.Options): Benchmark.Suite | Promise<Benchmark.Suite>;
}

export function withCodSpeed(suite: Benchmark): WithCodSpeedBenchmark;
export function withCodSpeed(suite: Benchmark.Suite): WithCodSpeedSuite;
export function withCodSpeed(item: unknown): unknown {
  if ((item as { length?: number }).length === undefined) {
    return withCodSpeedBenchmark(item as Benchmark);
  } else {
    return withCodSpeedSuite(item as Benchmark.Suite);
  }
}

function withCodSpeedBenchmark(bench: Benchmark): WithCodSpeedBenchmark {
  if (!Measurement.isInstrumented()) {
    const rawRun = bench.run;
    bench.run = (options?: Benchmark.Options) => {
      console.warn(
        `[CodSpeed] bench detected but no instrumentation found, falling back to benchmark.js`
      );
      return rawRun.bind(bench)(options);
    };
    return bench;
  }
  const callingFile = getCallingFile(2); // [here, withCodSpeed, actual caller]
  const codspeedBench = bench as BenchmarkWithOptions;
  if (codspeedBench.name !== undefined) {
    codspeedBench.uri = `${callingFile}::${bench.name}`;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/ban-ts-comment
  // @ts-ignore
  bench.run = async function (options?: Benchmark.Options): Promise<Benchmark> {
    await runBenchmarks({
      benches: [codspeedBench],
      baseUri: callingFile,
      benchmarkCompletedListeners: bench.listeners("complete"),
      options,
    });
    return bench;
  };
  return bench;
}

function withCodSpeedSuite(suite: Benchmark.Suite): WithCodSpeedSuite {
  if (!Measurement.isInstrumented()) {
    const rawRun = suite.run;
    suite.run = (options?: Benchmark.Options) => {
      console.warn(
        `[CodSpeed] ${suite.length} benches detected but no instrumentation found, falling back to benchmark.js`
      );
      return rawRun.bind(suite)(options);
    };
    return suite as WithCodSpeedSuite;
  }
  suite.add = buildSuiteAdd(suite);
  const callingFile = getCallingFile(2); // [here, withCodSpeed, actual caller]
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/ban-ts-comment
  // @ts-ignore
  suite.run = async function (
    options?: Benchmark.Options
  ): Promise<Benchmark.Suite> {
    const suiteName = suite.name;
    const benches = this as unknown as BenchmarkWithOptions[];
    let baseUri = callingFile;
    if (suiteName !== undefined) {
      baseUri += `::${suiteName}`;
    }
    await runBenchmarks({
      benches,
      baseUri,
      benchmarkCompletedListeners: suite.listeners("complete"),
      options,
    });
    return suite;
  };
  return suite as WithCodSpeedSuite;
}

type BenchmarkWithOptions = CodSpeedBenchmark & { options: Benchmark.Options };

interface RunBenchmarksOptions {
  benches: BenchmarkWithOptions[];
  baseUri: string;
  benchmarkCompletedListeners: CallableFunction[];
  options?: Benchmark.Options;
}

async function runBenchmarks({
  benches,
  baseUri,
  benchmarkCompletedListeners,
}: RunBenchmarksOptions): Promise<void> {
  console.log(`[CodSpeed] running with @codspeed/benchmark.js v${__VERSION__}`);
  setupCore();
  for (let i = 0; i < benches.length; i++) {
    const bench = benches[i];
    const uri = bench.uri ?? `${baseUri}::unknown_${i}`;
    const isAsync = bench.options.async || bench.options.defer;
    let benchPayload;
    if (bench.options.defer) {
      benchPayload = () => {
        return new Promise((resolve, reject) => {
          (bench.fn as CallableFunction)({ resolve, reject });
        });
      };
    } else if (bench.options.async) {
      benchPayload = async () => {
        await (bench.fn as CallableFunction)();
      };
    } else {
      benchPayload = bench.fn as CallableFunction;
    }

    await mongoMeasurement.start(uri);
    if (isAsync) {
      await optimizeFunction(benchPayload);
      await (async function __codspeed_root_frame__() {
        Measurement.startInstrumentation();
        await benchPayload();
        Measurement.stopInstrumentation(uri);
      })();
    } else {
      optimizeFunctionSync(benchPayload);
      (function __codspeed_root_frame__() {
        Measurement.startInstrumentation();
        benchPayload();
        Measurement.stopInstrumentation(uri);
      })();
    }
    await mongoMeasurement.stop(uri);

    console.log(`    ✔ Measured ${uri}`);
    benchmarkCompletedListeners.forEach((listener) => listener());
    teardownCore();
  }
  console.log(`[CodSpeed] Done running ${benches.length} benches.`);
}
