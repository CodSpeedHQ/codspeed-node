import {
  InstrumentHooks,
  mongoMeasurement,
  optimizeFunction,
  teardownCore,
} from "@codspeed/core";
import { Bench, Fn, FnOptions, Task } from "tinybench";
import { getTaskUri } from "./uri";

declare const __VERSION__: string;

export function runInstrumentedBench(
  bench: Bench,
  rootCallingFile: string
): void {
  const runTaskAsync = async (task: Task, uri: string): Promise<void> => {
    const { fnOpts, fn } = task as unknown as { fnOpts?: FnOptions; fn: Fn };

    await fnOpts?.beforeAll?.call(task, "run");
    await optimizeFunction(async () => {
      await fnOpts?.beforeEach?.call(task, "run");
      await fn();
      await fnOpts?.afterEach?.call(task, "run");
    });
    await fnOpts?.beforeEach?.call(task, "run");
    await mongoMeasurement.start(uri);

    await (async function __codspeed_root_frame__() {
      global.gc?.();
      InstrumentHooks.startBenchmark();
      await fn();
      InstrumentHooks.stopBenchmark();
      InstrumentHooks.setExecutedBenchmark(process.pid, uri);
    })();

    await mongoMeasurement.stop(uri);
    await fnOpts?.afterEach?.call(task, "run");
    await fnOpts?.afterAll?.call(task, "run");
  };

  // Sync task runner
  const runTaskSync = (task: Task, uri: string): void => {
    const { fnOpts, fn } = task as unknown as { fnOpts?: FnOptions; fn: Fn };

    fnOpts?.beforeAll?.call(task, "run");
    fnOpts?.beforeEach?.call(task, "run");

    (function __codspeed_root_frame__() {
      global.gc?.();
      InstrumentHooks.startBenchmark();
      fn();
      InstrumentHooks.stopBenchmark();
      InstrumentHooks.setExecutedBenchmark(process.pid, uri);
    })();

    fnOpts?.afterEach?.call(task, "run");
    fnOpts?.afterAll?.call(task, "run");
  };

  bench.run = async () => {
    logStart();

    for (const task of bench.tasks) {
      const uri = getTaskUri(bench, task.name, rootCallingFile);
      await runTaskAsync(task, uri);
      logTaskCompletion(uri);
    }

    return logEnd();
  };

  bench.runSync = () => {
    logStart();

    for (const task of bench.tasks) {
      const uri = getTaskUri(bench, task.name, rootCallingFile);
      runTaskSync(task, uri);
      logTaskCompletion(uri);
    }

    return logEnd();
  };

  const logStart = () => {
    console.log(
      `[CodSpeed] running with @codspeed/tinybench v${__VERSION__} (instrumented mode)`
    );
  };

  const logTaskCompletion = (uri: string) => {
    console.log(
      `    ✔ ${
        InstrumentHooks.isInstrumented() ? "Measured" : "Checked"
      } ${uri}`
    );
  };

  const logEnd = () => {
    teardownCore();
    console.log(`[CodSpeed] Done running ${bench.tasks.length} benches.`);
    return bench.tasks;
  };
}
