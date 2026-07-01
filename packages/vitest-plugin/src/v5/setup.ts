import {
  getGitDir,
  getInstrumentMode,
  setupCore,
  type Benchmark,
} from "@codspeed/core";
import path from "path";
// `TestRunner` is the unified runner Vitest 5 introduced; it replaces the
// `NodeBenchmarkRunner` the legacy seam subclasses, and is re-exported from the
// package root. It is read off the namespace (rather than a named import) so the
// plugin still type-checks against Vitest 3/4, which don't export it; this
// module only ever runs under v5.
import * as vitest from "vitest";
import {
  installInstrumentHooks,
  patchTaskRunOnce,
  tinybenchTaskToBenchmark,
  writeAndLogWalltimeResults,
  type TinybenchBench,
  type TinybenchOptions,
  type TinybenchTask,
} from "../instrument";

const TestRunner = (vitest as unknown as { TestRunner: unknown }).TestRunner;

/**
 * Vitest 5 runs benchmarks inside `test()` through `TestRunner`, calling the
 * static `TestRunner.runBenchmarks(tinybench)` with a fully built tinybench
 * instance. That static is referenced directly (not through `this`), so a
 * runner subclass cannot intercept it — we patch the static in place instead.
 *
 * This module is registered as a Vitest `setupFile`, which runs in the worker
 * before any test file is collected. Importing it installs the patch as a side
 * effect. A setup file (rather than a custom `test.runner`) is used because it
 * leaves the runner untouched for non-benchmark tests and also applies to the
 * browser pool, where a Node runner file would not.
 */

interface TinybenchWithTasks extends TinybenchBench {
  name: string;
  tasks: TinybenchTask[];
  run(): Promise<unknown>;
  // tinybench exposes the resolved options on the instance
  opts?: TinybenchOptions;
}

/** Minimal shape of the current Vitest test task we read for URI construction. */
interface CurrentTest {
  fullTestName?: string;
  file?: { filepath: string };
}

function getCurrentTest(): CurrentTest | undefined {
  // `getCurrentTest` is a static on the runner; typings don't surface it.
  const getter = (TestRunner as unknown as { getCurrentTest?: () => unknown })
    .getCurrentTest;
  return getter ? (getter() as CurrentTest | undefined) : undefined;
}

/**
 * Build the benchmark URI from the running test and the tinybench task name.
 * Matches the legacy convention: git-relative file, then the suite/test path,
 * then the bench name, all `::`-separated.
 */
function buildUri(taskName: string): string {
  const test = getCurrentTest();
  const filepath = test?.file?.filepath;
  if (!filepath) {
    throw new Error("[CodSpeed] could not resolve the running benchmark file");
  }
  const gitDir = getGitDir(filepath);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  const relativeFile = path.relative(gitDir, filepath);
  // `fullTestName` uses " > " between suite levels; normalize to "::".
  const testPath = (test?.fullTestName ?? "").split(" > ").join("::");
  return [relativeFile, testPath, taskName].filter(Boolean).join("::");
}

function collectWalltimeResults(tinybench: TinybenchWithTasks): void {
  const options: TinybenchOptions = tinybench.opts ?? {};
  const benchmarks: Benchmark[] = [];

  for (const task of tinybench.tasks) {
    if (task.result?.state && task.result.state !== "completed") continue;
    const benchmark = tinybenchTaskToBenchmark(
      task,
      buildUri(task.name),
      options,
    );
    if (benchmark) {
      benchmarks.push(benchmark);
    }
  }

  writeAndLogWalltimeResults(benchmarks);
}

function patchRunBenchmarks(): void {
  const Runner = TestRunner as unknown as {
    runBenchmarks: (tinybench: TinybenchWithTasks) => Promise<unknown>;
  };
  const originalRunBenchmarks = Runner.runBenchmarks.bind(TestRunner);
  const isWalltime = getInstrumentMode() === "walltime";

  Runner.runBenchmarks = async (tinybench: TinybenchWithTasks) => {
    setupCore();

    // tinybench's `Task` class isn't exported from the bench instance, so we
    // reach it through a constructed task (Vitest adds them before running).
    const TaskClass = tinybench.tasks[0]?.constructor as
      | { prototype: { run: (this: unknown) => Promise<unknown> } }
      | undefined;
    if (TaskClass) {
      patchTaskRunOnce(TaskClass);
    }

    installInstrumentHooks(tinybench, buildUri);

    const result = await originalRunBenchmarks(tinybench);

    if (isWalltime) {
      collectWalltimeResults(tinybench);
    }

    return result;
  };
}

patchRunBenchmarks();
