import {
  InstrumentHooks,
  logDebug,
  mongoMeasurement,
  optimizeFunction,
  setupCore,
  teardownCore,
} from "@codspeed/core";
import { Benchmark, type RunnerTestSuite } from "vitest";
import { NodeBenchmarkRunner } from "vitest/runners";
import { getBenchFn } from "vitest/suite";
import {
  callSuiteHook,
  isVitestTaskBenchmark,
  patchRootSuiteWithFullFilePath,
} from "./common";

const currentFileName =
  typeof __filename === "string"
    ? __filename
    : new URL("analysis.mjs", import.meta.url).pathname;

/**
 * @deprecated
 * TODO: try to use something like `updateTask` from `@vitest/runner` instead to use the output
 * of vitest instead console.log but at the moment, `updateTask` is not exposed
 */
function logCodSpeed(message: string) {
  console.log(`[CodSpeed] ${message}`);
}

async function runAnalysisBench(
  benchmark: Benchmark,
  suite: RunnerTestSuite,
  currentSuiteName: string
) {
  const uri = `${currentSuiteName}::${benchmark.name}`;
  const fn = getBenchFn(benchmark);

  await optimizeFunction(async () => {
    await callSuiteHook(suite, benchmark, "beforeEach");
    // @ts-expect-error we do not need to bind the function to an instance of tinybench's Bench
    await fn();
    await callSuiteHook(suite, benchmark, "afterEach");
  });

  await callSuiteHook(suite, benchmark, "beforeEach");
  await mongoMeasurement.start(uri);
  global.gc?.();
  await (async function __codspeed_root_frame__() {
    InstrumentHooks.startBenchmark();
    // @ts-expect-error we do not need to bind the function to an instance of tinybench's Bench
    await fn();
    InstrumentHooks.stopBenchmark();
    InstrumentHooks.setExecutedBenchmark(process.pid, uri);
  })();
  await mongoMeasurement.stop(uri);
  await callSuiteHook(suite, benchmark, "afterEach");

  logCodSpeed(`${uri} done`);
}

async function runAnalysisBenchmarkSuite(
  suite: RunnerTestSuite,
  parentSuiteName?: string
) {
  const currentSuiteName = parentSuiteName
    ? parentSuiteName + "::" + suite.name
    : suite.name;

  await callSuiteHook(suite, suite, "beforeAll");

  for (const task of suite.tasks) {
    if (task.mode !== "run") continue;

    if (isVitestTaskBenchmark(task)) {
      await runAnalysisBench(task, suite, currentSuiteName);
    } else if (task.type === "suite") {
      await runAnalysisBenchmarkSuite(task, currentSuiteName);
    }
  }

  await callSuiteHook(suite, suite, "afterAll");
}

export class AnalysisRunner extends NodeBenchmarkRunner {
  async runSuite(suite: RunnerTestSuite): Promise<void> {
    logDebug(`PROCESS PID: ${process.pid} in ${currentFileName}`);
    setupCore();

    patchRootSuiteWithFullFilePath(suite);

    logCodSpeed(`running suite ${suite.name}`);
    await runAnalysisBenchmarkSuite(suite);
    logCodSpeed(`running suite ${suite.name} done`);

    teardownCore();
  }
}

export default AnalysisRunner;
