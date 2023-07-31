import {
  getGitDir,
  Measurement,
  mongoMeasurement,
  optimizeFunction,
  setupCore,
  teardownCore,
  tryIntrospect,
} from "@codspeed/core";
import path from "path";
import { get as getStackTrace } from "stack-trace";
import { Bench, Task } from "tinybench";
import { fileURLToPath } from "url";

declare const __VERSION__: string;

tryIntrospect();

type CodSpeedBenchOptions = Task["opts"] & {
  uri: string;
};

function isCodSpeedBenchOptions(
  options: Task["opts"]
): options is CodSpeedBenchOptions {
  return "uri" in options;
}

export function withCodSpeed(bench: Bench): Bench {
  if (!Measurement.isInstrumented()) {
    const rawRun = bench.run;
    bench.run = async () => {
      console.warn(
        `[CodSpeed] ${bench.tasks.length} benches detected but no instrumentation found, falling back to tinybench`
      );
      return await rawRun.bind(bench)();
    };
    return bench;
  }

  const rawAdd = bench.add;
  bench.add = (name, fn, opts: CodSpeedBenchOptions) => {
    const callingFile = getCallingFile();
    const uri = `${callingFile}::${name}`;
    const options = Object.assign({}, opts ?? {}, { uri });
    return rawAdd.bind(bench)(name, fn, options);
  };
  const rootCallingFile = getCallingFile();

  bench.run = async () => {
    console.log(`[CodSpeed] running with @codspeed/tinybench v${__VERSION__}`);
    setupCore();
    for (const task of bench.tasks) {
      const uri = isCodSpeedBenchOptions(task.opts)
        ? task.opts.uri
        : `${rootCallingFile}::${task.name}`;

      await task.opts.beforeAll?.call(task);

      // run optimizations
      await optimizeFunction(async () => {
        await task.opts.beforeEach?.call(task);
        await task.fn();
        await task.opts.afterEach?.call(task);
      });

      // run instrumented benchmark
      await task.opts.beforeEach?.call(task);

      await mongoMeasurement.start(uri);
      await (async function __codspeed_root_frame__() {
        Measurement.startInstrumentation();
        await task.fn();
        Measurement.stopInstrumentation(uri);
      })();
      await mongoMeasurement.stop(uri);

      await task.opts.afterEach?.call(task);

      await task.opts.afterAll?.call(task);

      // print results
      console.log(`    ✔ Measured ${uri}`);
    }
    teardownCore();
    console.log(`[CodSpeed] Done running ${bench.tasks.length} benches.`);
    return bench.tasks;
  };
  return bench;
}

function getCallingFile(): string {
  const stack = getStackTrace();
  let callingFile = stack[2].getFileName(); // [here, withCodSpeed, actual caller]
  const gitDir = getGitDir(callingFile);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  if (callingFile.startsWith("file://")) {
    callingFile = fileURLToPath(callingFile);
  }
  return path.relative(gitDir, callingFile);
}
