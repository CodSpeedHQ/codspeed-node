import {
  Measurement,
  mongoMeasurement,
  optimizeFunction,
  setupCore,
  teardownCore,
} from "@codspeed/core";
import { Bench } from "tinybench";
import { taskUriMap } from "./index";

declare const __VERSION__: string;

function getTaskUri(
  bench: Bench,
  taskName: string,
  rootCallingFile: string
): string {
  const uriMap = taskUriMap.get(bench);
  return uriMap?.get(taskName) || `${rootCallingFile}::${taskName}`;
}

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

      // Access private fnOpts to get hooks
      const fnOpts = (task as any).fnOpts;

      // Call beforeAll hook if it exists
      await fnOpts?.beforeAll?.call(task, "run");

      // run optimizations
      await optimizeFunction(async () => {
        await fnOpts?.beforeEach?.call(task, "run");
        await (task as any).fn(); // Access private fn property
        await fnOpts?.afterEach?.call(task, "run");
      });

      // run instrumented benchmark
      await fnOpts?.beforeEach?.call(task, "run");

      await mongoMeasurement.start(uri);
      global.gc?.();
      await (async function __codspeed_root_frame__() {
        Measurement.startInstrumentation();
        await (task as any).fn(); // Access private fn property
        Measurement.stopInstrumentation(uri);
      })();
      await mongoMeasurement.stop(uri);

      await fnOpts?.afterEach?.call(task, "run");

      await fnOpts?.afterAll?.call(task, "run");

      // print results
      console.log(`    ✔ Measured ${uri}`);
    }

    teardownCore();
    console.log(`[CodSpeed] Done running ${bench.tasks.length} benches.`);
    return bench.tasks;
  };
}
