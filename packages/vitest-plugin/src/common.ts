import { getGitDir } from "@codspeed/core";
import path from "path";
import { Benchmark, type RunnerTask, type RunnerTestSuite } from "vitest";
import { getHooks } from "vitest/suite";
type SuiteHooks = ReturnType<typeof getHooks>;

function getSuiteHooks(suite: RunnerTestSuite, name: keyof SuiteHooks) {
  return getHooks(suite)?.[name] ?? [];
}

export async function callSuiteHook<T extends keyof SuiteHooks>(
  suite: RunnerTestSuite,
  currentTask: RunnerTask,
  name: T
): Promise<void> {
  if (name === "beforeEach" && suite?.suite) {
    await callSuiteHook(suite.suite, currentTask, name);
  }

  const hooks = getSuiteHooks(suite, name);

  // @ts-expect-error TODO: add support for hooks parameters
  await Promise.all(hooks.map((fn) => fn()));

  if (name === "afterEach" && suite?.suite) {
    await callSuiteHook(suite.suite, currentTask, name);
  }
}

export function patchRootSuiteWithFullFilePath(suite: RunnerTestSuite) {
  const gitDir = getGitDir(suite.file.filepath);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  suite.name = path.relative(gitDir, suite.file.filepath);
}

export function isVitestTaskBenchmark(task: RunnerTask): task is Benchmark {
  return task.type === "test" && task.meta.benchmark === true;
}
