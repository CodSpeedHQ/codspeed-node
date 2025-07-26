import { getGitDir } from "@codspeed/core";
import path from "path";
import { Suite, Task } from "vitest";
import { getHooks } from "vitest/suite";

type SuiteHooks = ReturnType<typeof getHooks>;

function getSuiteHooks(suite: Suite, name: keyof SuiteHooks) {
  return getHooks(suite)?.[name] ?? [];
}

export async function callSuiteHook<T extends keyof SuiteHooks>(
  suite: Suite,
  currentTask: Task,
  name: T
): Promise<void> {
  if (name === "beforeEach" && suite?.suite) {
    await callSuiteHook(suite.suite, currentTask, name);
  }

  const hooks = getSuiteHooks(suite, name);

  await Promise.all(hooks.map((fn) => fn()));

  if (name === "afterEach" && suite?.suite) {
    await callSuiteHook(suite.suite, currentTask, name);
  }
}

export function patchRootSuiteWithFullFilePath(suite: Suite) {
  if (suite.filepath === undefined) {
    throw new Error("filepath is undefined is the root suite");
  }
  const gitDir = getGitDir(suite.filepath);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  suite.name = path.relative(gitDir, suite.filepath);
}
