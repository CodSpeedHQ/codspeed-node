import Benchmark from "benchmark";
import measurement from "@codspeed/core";
import { get as getStackTrace } from "stack-trace";
import path, { dirname } from "path";
import { findUpSync, Options } from "find-up";

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
    return bench;
  }
  const callingFile = getCallingFile();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  bench.run = function (options?: Benchmark.Options): Benchmark {
    const uri = callingFile + "::" + (bench.name ?? "unknown");
    measurement.startMeasurement();
    (bench.fn as CallableFunction)();
    measurement.stopMeasurement(uri);
    return bench;
  };
  return bench;
}

function withCodSpeedSuite(suite: Benchmark.Suite): Benchmark.Suite {
  if (!measurement.isInstrumented()) {
    return suite;
  }
  const callingFile = getCallingFile();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  suite.run = function (options?: Benchmark.Options): Benchmark.Suite {
    const suiteName = suite.name;
    const benches = this as unknown as Benchmark[];
    let baseUri = callingFile;
    if (suiteName !== undefined) {
      baseUri += `::${suiteName}`;
    }
    for (let i = 0; i < benches.length; i++) {
      const bench = benches[i];
      const uri = baseUri + "::" + (bench.name ?? `unknown_${i}`);
      measurement.startMeasurement();
      (bench.fn as CallableFunction)();
      measurement.stopMeasurement(uri);
    }
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
