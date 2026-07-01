import {
  getGitDir,
  getInstrumentMode,
  InstrumentHooks,
  setupCore,
  teardownCore,
  type Benchmark,
} from "@codspeed/core";
import path from "path";
// `TestRunner` is the unified runner Vitest 5 introduced; it replaces the
// `NodeBenchmarkRunner` the legacy seam subclasses, and is re-exported from the
// package root. It is read off the namespace (rather than a named import) so the
// plugin still type-checks against Vitest 3/4, which don't export it; this
// module only ever runs under v5.
import { createRequire } from "module";
import * as vitest from "vitest";
import {
  captureBenchAddOnce,
  getCapturedTask,
  identityRegisterFn,
  installInstrumentHooks,
  rootFrameRegisterFn,
  runAnalysisTask,
  tinybenchTaskToBenchmark,
  writeAndLogWalltimeResults,
  type CapturedTask,
  type TinybenchBench,
  type TinybenchOptions,
  type TinybenchTask,
} from "../instrument";

const TestRunner = (vitest as unknown as { TestRunner: unknown }).TestRunner;

/** The tinybench Bench constructor, as reached from a live bench instance. */
interface TinybenchBenchClass {
  prototype: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    add: (...args: any[]) => unknown;
  };
}

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
  constructor: TinybenchBenchClass;
  // tinybench exposes the resolved options on the instance
  opts?: TinybenchOptions;
  // Bench-level run parameters, collapsed to a single pass for the throwaway
  // result run in analysis mode.
  iterations: number;
  time: number;
  warmup: boolean;
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
 * Build the benchmark URI from the running test: git-relative file then the
 * suite/test path, `::`-separated. In Vitest 5 a benchmark is a `bench()` call
 * inside a `test()`, so the enclosing test is the benchmark's identity — the
 * inner tinybench task name is an implementation detail and not part of the URI.
 * This mirrors the legacy `file::suite...::name` shape with the test playing the
 * role of the leaf.
 */
function buildUri(): string {
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
  return [relativeFile, testPath].filter(Boolean).join("::");
}

function collectWalltimeResults(
  tinybench: TinybenchWithTasks,
  uri: string,
): void {
  const options: TinybenchOptions = tinybench.opts ?? {};
  const benchmarks: Benchmark[] = [];

  for (const task of tinybench.tasks) {
    if (task.result?.state && task.result.state !== "completed") continue;
    const benchmark = tinybenchTaskToBenchmark(task, uri, options);
    if (benchmark) {
      benchmarks.push(benchmark);
    }
  }

  writeAndLogWalltimeResults(benchmarks);
}

const isWalltime = getInstrumentMode() === "walltime";

// setupCore starts the perf listener (analysis mode), which must run once for
// the worker's lifetime and be stopped so its data is flushed. Vitest 5 runs
// benchmarks per `test()` with no whole-suite bracket in the worker, so we start
// on the first benchmark and stop when the worker process exits, mirroring the
// single setupCore/teardownCore the Vitest 3/4 runner does around a suite.
let isCoreSetup = false;

function setupCoreOnce(): void {
  if (isCoreSetup) {
    return;
  }
  isCoreSetup = true;
  setupCore();
  process.once("beforeExit", () => teardownCore());
}

/**
 * Capture each benchmark's fn as it is registered. tinybench keeps the fn in a
 * `#private` field (v6), so it can't be read off the task later — the analysis
 * seam needs the raw fn, and the walltime seam needs the root frame baked in at
 * registration time. Both are handled here.
 *
 * The `Bench` class is resolved relative to the installed Vitest so we patch the
 * exact class Vitest instantiates, even though the plugin's own tinybench may be
 * a different version. Registration happens before `runBenchmarks`, so this must
 * be installed at module load, before any test runs.
 */
async function captureBenchRegistrations(): Promise<void> {
  try {
    const require = createRequire(import.meta.url);
    const vitestRequire = createRequire(require.resolve("vitest/package.json"));
    // Resolve the path with `require.resolve` but load with `import()`:
    // tinybench v6 is ESM, so `require()`-ing it throws.
    const tinybench = (await import(vitestRequire.resolve("tinybench"))) as {
      Bench: TinybenchBenchClass;
    };
    captureBenchAddOnce(
      tinybench.Bench,
      isWalltime ? rootFrameRegisterFn : identityRegisterFn,
    );
  } catch {
    // If tinybench can't be resolved the run will surface a clearer error when
    // the benchmark actually executes; nothing to instrument here.
  }
}

function patchRunBenchmarks(): void {
  const Runner = TestRunner as unknown as {
    runBenchmarks: (tinybench: TinybenchWithTasks) => Promise<unknown>;
  };
  const originalRunBenchmarks = Runner.runBenchmarks.bind(TestRunner);

  Runner.runBenchmarks = async (tinybench: TinybenchWithTasks) => {
    // Ensure the registration capture is installed before we act on the bench.
    // The import kicks off at module load (during collection) and is well
    // settled by the time the first benchmark runs; awaiting here avoids a
    // top-level await while still guaranteeing ordering.
    await captureReady;
    setupCoreOnce();

    // Resolve the URI up front, outside any measured window. It walks the
    // filesystem (git root lookup), which must not land inside the sample.
    const uri = buildUri();

    if (isWalltime) {
      // tinybench drives the measured loop; bracket it with the instrument
      // window via the setup/teardown hooks (the root frame is already baked
      // into the registered fn).
      installInstrumentHooks(tinybench, () => uri);
      const result = await originalRunBenchmarks(tinybench);
      collectWalltimeResults(tinybench, uri);
      return result;
    }

    // Analysis (instrumentation/simulation): run the captured fn ourselves under
    // the exact window the Vitest 3/4 runner uses, then let tinybench run
    // uninstrumented purely to populate the `result` Vitest reads afterwards.
    // The real measurement is ours; collapse tinybench's run to a single pass so
    // the throwaway result run stays cheap.
    await runAnalysisBenchmarks(tinybench, uri);
    tinybench.warmup = false;
    tinybench.time = 0;
    tinybench.iterations = 1;
    return originalRunBenchmarks(tinybench);
  };
}

async function runAnalysisBenchmarks(
  tinybench: TinybenchWithTasks,
  uri: string,
): Promise<void> {
  const label = InstrumentHooks.isInstrumented() ? "Measured" : "Checked";
  for (const task of tinybench.tasks) {
    const captured: CapturedTask | undefined = getCapturedTask(
      tinybench,
      task.name,
    );
    if (!captured) {
      continue;
    }
    await runAnalysisTask(captured, uri);
    console.log(`[CodSpeed] ${label} ${uri}`);
  }
}

// Kick off the capture install at module load (during collection). `runBenchmarks`
// awaits this before touching the bench, so it is guaranteed settled before any
// benchmark's results are read — well after benchmarks start executing.
const captureReady = captureBenchRegistrations();
patchRunBenchmarks();
