import {
  getCallingFile,
  InstrumentHooks,
  Isolation,
  mongoMeasurement,
  optimizeFunction,
  optimizeFunctionSync,
  setupCore,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
  teardownCore,
  tryIntrospect,
  wrapWithRootFrame,
  wrapWithRootFrameSync,
} from "@codspeed/core";
import Benchmark from "benchmark";
import buildSuiteAdd from "./buildSuiteAdd";
import { CodSpeedBenchmark } from "./types";

declare const __VERSION__: string;

tryIntrospect();

interface WithCodSpeedBenchmark extends Omit<
  Benchmark,
  "run" | "abort" | "clone" | "compare" | "emit" | "off" | "on" | "reset"
> {
  abort(): WithCodSpeedBenchmark;
  clone(options: Benchmark.Options): WithCodSpeedBenchmark;
  compare(benchmark: Benchmark): number;
  off(
    type?: string,
    listener?: CallableFunction,
  ): Benchmark | Promise<Benchmark>;
  off(types: string[]): WithCodSpeedBenchmark;
  on(type?: string, listener?: CallableFunction): WithCodSpeedBenchmark;
  on(types: string[]): WithCodSpeedBenchmark;
  reset(): WithCodSpeedBenchmark;
  // Makes run an async function
  run(options?: Benchmark.Options): Benchmark | Promise<Benchmark>;
}

export interface WithCodSpeedSuite extends Omit<
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
    options?: Benchmark.Options,
  ): WithCodSpeedSuite;
  add(
    fn: CallableFunction | string,
    options?: Benchmark.Options,
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
  if (!InstrumentHooks.isInstrumented()) {
    const rawRun = bench.run;
    bench.run = (options?: Benchmark.Options) => {
      console.warn(
        `[CodSpeed] bench detected but no instrumentation found, falling back to benchmark.js`,
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
  if (!InstrumentHooks.isInstrumented()) {
    const rawRun = suite.run;
    suite.run = (options?: Benchmark.Options) => {
      console.warn(
        `[CodSpeed] ${suite.length} benches detected but no instrumentation found, falling back to benchmark.js`,
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
    options?: Benchmark.Options,
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
  const isolation = Isolation.current();
  const isChild = isolation.isChild();
  const all = benches.map((bench, i) => ({
    bench,
    uri: bench.uri ?? `${baseUri}::unknown_${i}`,
  }));
  // A child only measures one benchmark. A run call that owns none of them
  // must not touch the instruments, the call that owns it does.
  const measures = all.some(({ uri }) => isolation.shouldRun(uri));

  // The parent already printed the banner and the summary, children stay quiet.
  if (!isChild) {
    console.log(
      `[CodSpeed] running with @codspeed/benchmark.js v${__VERSION__}`,
    );
  }
  if (measures) {
    setupCore();
  }
  for (const { bench, uri } of all) {
    if (isolation.shouldRun(uri)) {
      await isolation.run(uri, () => measureBenchmark(bench, uri));
    }
    // Also in children, for benchmarks they skip: a `complete` listener may
    // start the run that owns the child's benchmark.
    benchmarkCompletedListeners.forEach((listener) => listener());
  }
  if (measures) {
    teardownCore();
  }
  if (!isChild) {
    console.log(`[CodSpeed] Done running ${benches.length} benches.`);
  }
}

async function measureBenchmark(
  bench: BenchmarkWithOptions,
  uri: string,
): Promise<void> {
  const isAsync = bench.options.async || bench.options.defer;
  let benchPayload;
  if (bench.options.defer) {
    benchPayload = () => {
      const { promise, resolve, reject } = Promise.withResolvers<unknown>();
      (bench.fn as CallableFunction)({ resolve, reject });
      return promise;
    };
  } else if (bench.options.async) {
    benchPayload = async () => {
      await (bench.fn as CallableFunction)();
    };
  } else {
    benchPayload = bench.fn as CallableFunction;
  }

  if (typeof bench.options.setup === "function") {
    await bench.options.setup();
  }

  if (isAsync) {
    await optimizeFunction(benchPayload);
    await mongoMeasurement.start(uri);
    global.gc?.();
    await wrapWithRootFrame(async () => {
      InstrumentHooks.startBenchmark();
      await benchPayload();
      InstrumentHooks.stopBenchmark();
      InstrumentHooks.setExecutedBenchmark(process.pid, uri);
    })();
    await mongoMeasurement.stop(uri);
  } else {
    optimizeFunctionSync(benchPayload);
    await mongoMeasurement.start(uri);
    wrapWithRootFrameSync(() => {
      InstrumentHooks.startBenchmark();
      benchPayload();
      InstrumentHooks.stopBenchmark();
      InstrumentHooks.setExecutedBenchmark(process.pid, uri);
    })();
    await mongoMeasurement.stop(uri);
  }

  if (typeof bench.options.teardown === "function") {
    await bench.options.teardown();
  }

  console.log(`    ✔ Measured ${uri}`);
}

/**
 * Dynamically setup the CodSpeed instruments.
 */
export async function setupInstruments(
  body: SetupInstrumentsRequestBody,
): Promise<SetupInstrumentsResponse> {
  if (!InstrumentHooks.isInstrumented()) {
    console.warn("[CodSpeed] No instrumentation found, using default mongoUrl");

    return { remoteAddr: body.mongoUrl };
  }

  return await mongoMeasurement.setupInstruments(body);
}
