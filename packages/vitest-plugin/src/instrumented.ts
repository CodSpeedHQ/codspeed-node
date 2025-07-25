import {
  logDebug,
  Measurement,
  mongoMeasurement,
  optimizeFunction,
  setupCore,
  teardownCore,
} from "@codspeed/core";
import { Benchmark, chai, Suite } from "vitest";
import { NodeBenchmarkRunner } from "vitest/runners";
import { getBenchFn } from "vitest/suite";
import { callSuiteHook, patchRootSuiteWithFullFilePath } from "./common";

const currentFileName =
  typeof __filename === "string"
    ? __filename
    : new URL("instrumented.mjs", import.meta.url).pathname;

/**
 * @deprecated
 * TODO: try to use something like `updateTask` from `@vitest/runner` instead to use the output
 * of vitest instead console.log but at the moment, `updateTask` is not exposed
 */
function logCodSpeed(message: string) {
  console.log(`[CodSpeed] ${message}`);
}

async function runInstrumentedBench(
  benchmark: Benchmark,
  currentSuiteName: string
) {
  const uri = `${currentSuiteName}::${benchmark.name}`;
  const fn = getBenchFn(benchmark);

  await callSuiteHook(benchmark.suite, benchmark, "beforeEach");
  try {
    await optimizeFunction(fn);
  } catch (e) {
    // if the error is not an assertion error, we want to fail the run
    // we allow assertion errors because we want to be able to use `expect` in the benchmark to allow for better authoring
    // assertions are allowed to fail in the optimization phase since it might be linked to stateful code
    if (!(e instanceof chai.AssertionError)) {
      throw e;
    }
  }
  await callSuiteHook(benchmark.suite, benchmark, "afterEach");

  await callSuiteHook(benchmark.suite, benchmark, "beforeEach");
  await mongoMeasurement.start(uri);
  global.gc?.();
  await (async function __codspeed_root_frame__() {
    Measurement.startInstrumentation();
    // @ts-expect-error we do not need to bind the function to an instance of tinybench's Bench
    await fn();
    Measurement.stopInstrumentation(uri);
  })();
  await mongoMeasurement.stop(uri);
  await callSuiteHook(benchmark.suite, benchmark, "afterEach");

  logCodSpeed(`${uri} done`);
}

async function runInstrumentedBenchmarkSuite(
  suite: Suite,
  parentSuiteName?: string
) {
  const currentSuiteName = parentSuiteName
    ? parentSuiteName + "::" + suite.name
    : suite.name;

  // do not call `beforeAll` if we are in the root suite, since it is already called by vitest
  // see https://github.com/vitest-dev/vitest/blob/1fee63f2598edc228017f18eca325f85ee54aee0/packages/runner/src/run.ts#L293
  if (parentSuiteName !== undefined) {
    await callSuiteHook(suite, suite, "beforeAll");
  }

  for (const task of suite.tasks) {
    if (task.mode !== "run") continue;

    if (task.meta?.benchmark) {
      await runInstrumentedBench(task as Benchmark, currentSuiteName);
    } else if (task.type === "suite") {
      await runInstrumentedBenchmarkSuite(task, currentSuiteName);
    }
  }

  // do not call `afterAll` if we are in the root suite, since it is already called by vitest
  // see https://github.com/vitest-dev/vitest/blob/1fee63f2598edc228017f18eca325f85ee54aee0/packages/runner/src/run.ts#L324
  if (parentSuiteName !== undefined) {
    await callSuiteHook(suite, suite, "afterAll");
  }
}

export class InstrumentedRunner extends NodeBenchmarkRunner {
  async runSuite(suite: Suite): Promise<void> {
    logDebug(`PROCESS PID: ${process.pid} in ${currentFileName}`);
    setupCore();

    patchRootSuiteWithFullFilePath(suite);

    logCodSpeed(`running suite ${suite.name}`);
    await runInstrumentedBenchmarkSuite(suite);
    logCodSpeed(`running suite ${suite.name} done`);

    teardownCore();
  }
}

