import {
  getWalltimeForks,
  isFork,
  isGcBetweenRoundsEnabled,
  ISOLATED_BENCHMARK_ENV,
  runForks,
  setupCore,
  wrapWithRootFrame,
  writeForkSamples,
} from "@codspeed/core";
import {
  RunnerTaskEventPack,
  RunnerTaskResultPack,
  type RunnerTestSuite,
} from "vitest";
import {
  installInstrumentHooks,
  withGcAfter,
  writeAndLogWalltimeResults,
  type Tinybench,
  type TinybenchBench,
  type TinybenchRoundHook,
} from "../instrument";
import {
  isVitestTaskBenchmark,
  patchRootSuiteWithFullFilePath,
} from "./common";
import { getBenchFn, NodeBenchmarkRunner, type BenchmarkTask } from "./compat";
import { extractBenchmarkResults } from "./walltime-utils";

/** A tinybench v2 task, whose `fn` is a plain, reassignable property. */
interface TinybenchTask {
  name: string;
  fn: () => unknown;
  mode?: string;
  opts: { beforeEach?: TinybenchRoundHook };
  loop: (time: number, iterations: number) => Promise<TinybenchLoopResult>;
}

interface TinybenchLoopResult {
  samples?: number[];
  error?: unknown;
}

const patchedPrototypes = new WeakSet<object>();
let activeRunner: WalltimeRunner | null = null;

/**
 * Lets tinybench run the benches through Vitest's default benchmark execution,
 * instrumenting each measured loop, then extracts the results from the suite
 * tree afterwards.
 */
export class WalltimeRunner extends NodeBenchmarkRunner {
  private suiteUris = new Map<string, string>();
  /// Suite ID of the currently running suite, to allow constructing the URI in the context of tinybench tasks
  private currentSuiteId: string | null = null;
  /// Forks per benchmark in the parent process, unset when not forking
  parentForks: number | undefined;
  /// URIs of the benches of the running file, by bench name, for the forks parent
  private forkUris = new Map<string, Array<{ fn: unknown; uri: string }>>();

  isForkParent(): boolean {
    return this.parentForks !== undefined;
  }

  /**
   * URI of a bench in the forks parent. Unlike `getBenchmarkUri`, it doesn't
   * depend on the `suite-prepare` update, which Vitest sends throttled and may
   * not have arrived when the parent skips the warmup.
   */
  forkUri(name: string, fn: unknown): string {
    const matches = (this.forkUris.get(name) ?? []).filter(
      (bench) => bench.fn === fn,
    );
    if (matches.length !== 1) {
      throw new Error(
        `[CodSpeed] cannot tell which benchmark "${name}" is: ${matches.length} benchmarks share its name and function`,
      );
    }
    return matches[0].uri;
  }

  async runSuite(suite: RunnerTestSuite): Promise<void> {
    patchRootSuiteWithFullFilePath(suite);
    this.populateBenchmarkUris(suite);

    setupCore();

    this.parentForks = isFork() ? undefined : getWalltimeForks();
    const benches = benchUris(suite);
    if (isFork()) {
      const target = process.env[ISOLATED_BENCHMARK_ENV];
      for (const { task, uri } of benches) {
        if (uri !== target) task.mode = "skip";
      }
    }
    this.forkUris.clear();
    if (this.isForkParent()) {
      for (const { task, uri } of benches) {
        const sameName = this.forkUris.get(task.name) ?? [];
        sameName.push({ fn: getBenchFn(task), uri });
        this.forkUris.set(task.name, sameName);
      }
    }

    await super.runSuite(suite);

    // The parent writes the merged results of every fork.
    if (isFork()) {
      return;
    }

    const benchmarks = await extractBenchmarkResults(suite);
    if (benchmarks.length === 0) {
      console.warn(
        `[CodSpeed] No benchmark results found after suite execution`,
      );
      return;
    }
    writeAndLogWalltimeResults(benchmarks);
  }

  private populateBenchmarkUris(suite: RunnerTestSuite, parentPath = ""): void {
    const currentPath =
      parentPath !== "" ? `${parentPath}::${suite.name}` : suite.name;
    this.suiteUris.set(suite.id, currentPath);

    for (const task of suite.tasks) {
      if (task.type === "suite") {
        this.populateBenchmarkUris(task, currentPath);
      }
    }
  }

  getBenchmarkUri(taskName: string): string {
    if (this.currentSuiteId === null) {
      throw new Error("currentSuiteId is null - something went wrong");
    }
    const suiteUri = this.suiteUris.get(this.currentSuiteId) || "";
    return `${suiteUri}::${taskName}`;
  }

  async importTinybench(): Promise<Tinybench> {
    const tinybench = await super.importTinybench();

    // `tinybench` is a frozen ES module namespace, so the `Bench` export cannot
    // be reassigned. Mutating the shared `Task.prototype` in place is allowed;
    // it outlives runner instances, so it is patched once and routes to the
    // runner that imported tinybench last. The rounds patch goes on top, so it
    // still sees the bench's own `fn`. The instrumented `Bench` is handed back
    // through a fresh module-shaped object that Vitest destructures from.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    activeRunner = this;
    if (!patchedPrototypes.has(tinybench.Task.prototype)) {
      patchedPrototypes.add(tinybench.Task.prototype);
      patchTaskWithRootFrame(tinybench);
      patchTaskRounds(tinybench);
    }

    return {
      ...tinybench,
      Bench: this.createInstrumentedBench(tinybench),
    };
  }

  private createInstrumentedBench(
    tinybench: Tinybench,
  ): typeof tinybench.Bench {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const runner = this;
    const OriginalBench = tinybench.Bench;

    class InstrumentedBench extends OriginalBench {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(...benchArgs: any[]) {
        super(...benchArgs);
        if (runner.isForkParent()) {
          return;
        }
        installInstrumentHooks(this as unknown as TinybenchBench, (taskName) =>
          runner.getBenchmarkUri(taskName),
        );
      }
    }

    return InstrumentedBench;
  }

  // Allow tinybench to retrieve the path to the currently running suite
  async onTaskUpdate(
    _: RunnerTaskResultPack[],
    events: RunnerTaskEventPack[],
  ): Promise<void> {
    events.map((event) => {
      const [id, eventName] = event;

      if (eventName === "suite-prepare") {
        this.currentSuiteId = id;
      }
    });
  }
}

/**
 * Wrap each task's function with the root frame so collected stacks can be
 * attributed to a benchmark.
 */
function patchTaskWithRootFrame(tinybench: Tinybench): void {
  const originalRun = tinybench.Task.prototype.run;

  tinybench.Task.prototype.run = async function () {
    const task = this as unknown as TinybenchTask;
    const originalFn = task.fn;
    task.fn = wrapWithRootFrame(() => originalFn.call(task));

    try {
      await originalRun.call(this);
    } finally {
      task.fn = originalFn;
    }

    return this;
  };
}

/**
 * Forks parent: skip warmup and replace the measured loop with the samples
 * of every fork. Fork child: hand the measured samples to the parent.
 * Otherwise: optionally collect garbage before every round.
 */
function patchTaskRounds(tinybench: Tinybench): void {
  const originalWarmup = tinybench.Task.prototype.warmup;
  const originalRun = tinybench.Task.prototype.run;
  const gcComposed = new WeakSet<object>();

  const composeGc = (task: TinybenchTask) => {
    if (gcComposed.has(task) || !isGcBetweenRoundsEnabled()) {
      return;
    }
    gcComposed.add(task);
    task.opts.beforeEach = withGcAfter(task.opts.beforeEach);
  };

  tinybench.Task.prototype.warmup = async function () {
    if (activeRunner!.isForkParent()) {
      return;
    }
    composeGc(this as unknown as TinybenchTask);
    return originalWarmup.call(this);
  };

  tinybench.Task.prototype.run = async function () {
    const task = this as unknown as TinybenchTask;
    const originalLoop = task.loop;

    if (activeRunner!.isForkParent()) {
      const runner = activeRunner!;
      // Read before the root frame patch wraps `fn` for the run.
      const fn = task.fn;
      // Returned, not thrown: tinybench only reports errors from its loop, and
      // a rejected run() would leave Vitest waiting forever.
      task.loop = async () => {
        try {
          return {
            samples: runForks(
              runner.forkUri(task.name, fn),
              runner.parentForks!,
            ),
          };
        } catch (error) {
          return { error };
        }
      };
    } else {
      composeGc(task);
      if (isFork()) {
        task.loop = async (time, iterations) => {
          const result = await originalLoop.call(task, time, iterations);
          if (result.samples) {
            // Copied: tinybench sorts and Vitest may truncate the array.
            writeForkSamples([...result.samples]);
          }
          return result;
        };
      }
    }

    try {
      return await originalRun.call(this);
    } finally {
      task.loop = originalLoop;
    }
  };
}

/** Every bench of `suite` with its URI, built like `extractBenchmarkResults`. */
function benchUris(
  suite: RunnerTestSuite,
  parentPath = "",
): Array<{ task: BenchmarkTask; uri: string }> {
  const currentPath = parentPath ? `${parentPath}::${suite.name}` : suite.name;
  return suite.tasks.flatMap((task) => {
    if (task.type === "suite") {
      return benchUris(task, currentPath);
    }
    if (!isVitestTaskBenchmark(task)) {
      return [];
    }
    return [{ task, uri: `${currentPath}::${task.name}` }];
  });
}

export default WalltimeRunner;
