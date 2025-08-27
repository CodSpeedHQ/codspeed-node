import {
  InstrumentHooks,
  mongoMeasurement,
  optimizeFunction,
  setupCore,
  teardownCore,
} from "@codspeed/core";
import { Bench, Fn, FnOptions } from "tinybench";
import { getTaskUri } from "./uri";

declare const __VERSION__: string;

export function runInstrumentedBench(
  bench: Bench,
  rootCallingFile: string
): void {
  bench.run = async () => {
    console.log(
      `[CodSpeed] running with @codspeed/tinybench v${__VERSION__} (instrumented mode)`
    );
    setupCore();

    for (const task of bench.tasks) {
      const uri = getTaskUri(bench, task.name, rootCallingFile);

      // Access private fields
      const { fnOpts, fn } = task as unknown as { fnOpts?: FnOptions; fn: Fn };

      // Call beforeAll hook if it exists
      await fnOpts?.beforeAll?.call(task, "run");

      // run optimizations
      await optimizeFunction(async () => {
        await fnOpts?.beforeEach?.call(task, "run");
        await fn();
        await fnOpts?.afterEach?.call(task, "run");
      });

      // run instrumented benchmark
      await fnOpts?.beforeEach?.call(task, "run");

      await mongoMeasurement.start(uri);
      global.gc?.();
      await (async function __codspeed_root_frame__() {
        InstrumentHooks.startBenchmark();
        await fn();
        InstrumentHooks.stopBenchmark();
        InstrumentHooks.setExecutedBenchmark(process.pid, uri);
      })();
      await mongoMeasurement.stop(uri);

      await fnOpts?.afterEach?.call(task, "run");

      await fnOpts?.afterAll?.call(task, "run");

      // print results
      console.log(
        `    ✔ ${
          InstrumentHooks.isInstrumented() ? "Measured" : "Checked"
        } ${uri}`
      );
    }

    teardownCore();
    console.log(`[CodSpeed] Done running ${bench.tasks.length} benches.`);
    return bench.tasks;
  };
}
