import {
  getGitDir,
  logDebug,
  Measurement,
  optimizeFunction,
  setupCore,
  teardownCore,
} from "@codspeed/core";
import path from "path";
import { Benchmark, Suite } from "vitest";
import { NodeBenchmarkRunner } from "vitest/runners";
import { getBenchFn } from "vitest/suite";

async function doSomeWork() {
  for (let i = 0; i < 1000; i++) {
    Math.random();
  }
}
const currentFileName =
  typeof __filename === "string"
    ? __filename
    : new URL("runner.mjs", import.meta.url).pathname;

/**
 * @deprecated
 * TODO: try to use something like `updateTask` from `@vitest/runner` instead to use the output
 * of vitest instead console.log but at the moment, `updateTask` is not exposed
 */
function logCodSpeed(message: string) {
  console.log(`[CodSpeed] ${message}`);
}

async function runBenchmarkSuite(suite: Suite, parentSuiteName?: string) {
  const benchmarkGroup: Benchmark[] = [];
  const benchmarkSuiteGroup: Suite[] = [];
  for (const task of suite.tasks) {
    if (task.mode !== "run") continue;

    if (task.meta?.benchmark) benchmarkGroup.push(task as Benchmark);
    else if (task.type === "suite") benchmarkSuiteGroup.push(task);
  }

  const currentSuiteName = parentSuiteName
    ? parentSuiteName + "::" + suite.name
    : suite.name;

  for (const subSuite of benchmarkSuiteGroup) {
    await runBenchmarkSuite(subSuite, currentSuiteName);
  }

  for (const benchmark of benchmarkGroup) {
    const uri = `${currentSuiteName}::${benchmark.name}`;
    const fn = getBenchFn(benchmark);

    await optimizeFunction(fn);
    await doSomeWork();
    await (async function __codspeed_root_frame__() {
      Measurement.startInstrumentation();
      // @ts-expect-error we do not need to bind the function to an instance of tinybench's Bench
      await fn();
      Measurement.stopInstrumentation(uri);
    })();
    await doSomeWork();

    logCodSpeed(`${uri} done`);
  }
}

function patchRootSuiteWithFullFilePath(suite: Suite) {
  if (suite.filepath === undefined) {
    throw new Error("filepath is undefined is the root suite");
  }
  const gitDir = getGitDir(suite.filepath);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  suite.name = path.relative(gitDir, suite.filepath);
}

class CodSpeedRunner extends NodeBenchmarkRunner {
  async runSuite(suite: Suite): Promise<void> {
    logDebug(`PROCESS PID: ${process.pid} in ${currentFileName}`);
    setupCore();

    patchRootSuiteWithFullFilePath(suite);

    logCodSpeed(`running suite ${suite.name}`);

    await runBenchmarkSuite(suite);
    logCodSpeed(`running suite ${suite.name} done`);

    teardownCore();
  }
}

export default CodSpeedRunner;
