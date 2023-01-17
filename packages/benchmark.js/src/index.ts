import Benchmark from "benchmark";
import { initCore, measurement, optimizeFunctionSync } from "@codspeed/core";
import { get as getStackTrace } from "stack-trace";
import path, { dirname } from "path";
import { findUpSync, Options } from "find-up";

declare const __VERSION__: string;

export function withCodSpeed(suite: Benchmark): Benchmark;
export function withCodSpeed(suite: Benchmark.Suite): Benchmark.Suite;
export function withCodSpeed(item: unknown): unknown {
  if ((item as { length?: number }).length === undefined) {
    return withCodSpeedBenchmark(item as Benchmark);
  } else {
    return withCodSpeedSuite(item as Benchmark.Suite);
  }
}

function withCodSpeedBenchmark(bench: Benchmark): Benchmark {
  if (!measurement.isInstrumented()) {
    const rawRun = bench.run;
    bench.run = (options?: Benchmark.Options) => {
      console.warn(
        `[CodSpeed] bench detected but no instrumentation found, falling back to benchmark.js`
      );
      return rawRun.bind(bench)(options);
    };
    return bench;
  }
  initCore();
  const callingFile = getCallingFile();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  bench.run = function (options?: Benchmark.Options): Benchmark {
    console.log(
      `[CodSpeed] running with @codspeed/benchmark.js v${__VERSION__}`
    );
    const uri = callingFile + "::" + (bench.name ?? "unknown");
    const fn = bench.fn as CallableFunction;
    optimizeFunctionSync(fn);
    measurement.startInstrumentation();
    fn();
    measurement.stopInstrumentation(uri);
    console.log(`    ✔ Measured ${uri}`);
    console.log("[CodSpeed] Done running 1 bench.");
    return bench;
  };
  return bench;
}

function withCodSpeedSuite(suite: Benchmark.Suite): Benchmark.Suite {
  if (!measurement.isInstrumented()) {
    const rawRun = suite.run;
    suite.run = (options?: Benchmark.Options) => {
      console.warn(
        `[CodSpeed] ${suite.length} benches detected but no instrumentation found, falling back to benchmark.js`
      );
      return rawRun.bind(suite)(options);
    };
    return suite;
  }
  initCore();
  const callingFile = getCallingFile();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  suite.run = function (options?: Benchmark.Options): Benchmark.Suite {
    console.log(
      `[CodSpeed] running with @codspeed/benchmark.js v${__VERSION__}`
    );
    const suiteName = suite.name;
    const benches = this as unknown as Benchmark[];
    let baseUri = callingFile;
    if (suiteName !== undefined) {
      baseUri += `::${suiteName}`;
    }
    for (let i = 0; i < benches.length; i++) {
      const bench = benches[i];
      const uri = baseUri + "::" + (bench.name ?? `unknown_${i}`);
      const fn = bench.fn as CallableFunction;
      optimizeFunctionSync(fn);
      measurement.startInstrumentation();
      (bench.fn as CallableFunction)();
      measurement.stopInstrumentation(uri);
      console.log(`    ✔ Measured ${uri}`);
    }
    console.log(`[CodSpeed] Done running ${suite.length} benches.`);
    return suite;
  };
  return suite;
}

function getCallingFile(): string {
  const stack = getStackTrace();
  const callingFile = stack[3].getFileName(); // [here, withCodSpeed, withCodSpeedX, actual caller]
  const gitDir = getGitDir(callingFile);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  return path.relative(gitDir, callingFile);
}

function getGitDir(path: string): string | undefined {
  const dotGitPath = findUpSync(".git", {
    cwd: path,
    type: "directory",
  } as Options);
  return dotGitPath ? dirname(dotGitPath) : undefined;
}
