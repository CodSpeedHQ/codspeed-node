import {
  InstrumentHooks,
  MARKER_TYPE_BENCHMARK_END,
  MARKER_TYPE_BENCHMARK_START,
  setupCore,
  wrapWithRootFrame,
  writeWalltimeResults,
} from "@codspeed/core";
import type * as tinybench from "tinybench";
import {
  RunnerTaskEventPack,
  RunnerTaskResultPack,
  type RunnerTestSuite,
} from "vitest";
import { NodeBenchmarkRunner } from "vitest/runners";
import { patchRootSuiteWithFullFilePath } from "../common";
import { extractBenchmarkResults } from "./utils";

type Tinybench = typeof tinybench;

/** A tinybench task, exposing the `fn` the runner wraps with the root frame. */
interface TinybenchTask {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => any;
}

/** tinybench's per-task setup/teardown hook signature. */
type TinybenchHook = (
  task: TinybenchTask,
  mode: "run" | "warmup",
) => Promise<void> | void;

/** The mutable subset of a tinybench Bench the runner reaches into. */
interface TinybenchBench {
  setup: TinybenchHook;
  teardown: TinybenchHook;
}

/**
 * WalltimeRunner uses Vitest's default benchmark execution
 * and extracts results from the suite after completion
 */
export class WalltimeRunner extends NodeBenchmarkRunner {
  private isTinybenchHookedWithCodspeed = false;
  private suiteUris = new Map<string, string>();
  /// Suite ID of the currently running suite, to allow constructing the URI in the context of tinybench tasks
  private currentSuiteId: string | null = null;
  // Carries the window start timestamp from the setup hook to the teardown
  // hook. Tasks run strictly sequentially, so a single field is enough.
  private runStart: bigint | null = null;

  async runSuite(suite: RunnerTestSuite): Promise<void> {
    patchRootSuiteWithFullFilePath(suite);
    this.populateBenchmarkUris(suite);

    setupCore();

    await super.runSuite(suite);

    const benchmarks = await extractBenchmarkResults(suite);

    if (benchmarks.length > 0) {
      writeWalltimeResults(benchmarks);
      console.log(
        `[CodSpeed] Done collecting walltime data for ${benchmarks.length} benches.`,
      );
    } else {
      console.warn(
        `[CodSpeed] No benchmark results found after suite execution`,
      );
    }
  }

  private populateBenchmarkUris(suite: RunnerTestSuite, parentPath = ""): void {
    const currentPath =
      parentPath !== "" ? `${parentPath}::${suite.name}` : suite.name;

    for (const task of suite.tasks) {
      if (task.type === "suite") {
        this.suiteUris.set(task.id, `${currentPath}::${task.name}`);
        this.populateBenchmarkUris(task, currentPath);
      }
    }
  }

  private getBenchmarkUri(taskName: string): string {
    if (this.currentSuiteId === null) {
      throw new Error("currentSuiteId is null - something went wrong");
    }
    const suiteUri = this.suiteUris.get(this.currentSuiteId) || "";
    return `${suiteUri}::${taskName}`;
  }

  async importTinybench(): Promise<Tinybench> {
    const tinybench = await super.importTinybench();

    // `tinybench` is a frozen ES module namespace, so the `Bench` export cannot
    // be reassigned. Mutating the shared `Task.prototype` in place is allowed
    // and only needs to happen once; the instrumented `Bench` is handed back
    // through a fresh module-shaped object that Vitest destructures from.
    if (!this.isTinybenchHookedWithCodspeed) {
      this.isTinybenchHookedWithCodspeed = true;
      this.patchTaskWithRootFrame(tinybench);
    }

    return {
      ...tinybench,
      Bench: this.createInstrumentedBench(tinybench),
    };
  }

  /**
   * Wrap each task's function with the root frame so collected stacks can be
   * attributed to a benchmark. The window itself is driven by the bench's
   * setup/teardown hooks (see createInstrumentedBench).
   */
  private patchTaskWithRootFrame(tinybench: Tinybench): void {
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
   * Drive the instrumentation window from each bench's run-mode setup/teardown
   * hooks so it brackets only tinybench's measured loop, excluding the warmup
   * that Vitest runs beforehand and the statistics computation tinybench
   * performs after the loop. Wrapping the whole `Task.run()` would otherwise
   * fold all of that framework overhead into the recorded sample.
   *
   * User-provided hooks are preserved and keep their order relative to the work
   * under test.
   */
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
        runner.installInstrumentHooks(this as unknown as TinybenchBench);
      }
    }

    return InstrumentedBench;
  }

  private installInstrumentHooks(bench: TinybenchBench): void {
    const userSetup = bench.setup;
    const userTeardown = bench.teardown;

    bench.setup = async (task, mode) => {
      await userSetup(task, mode);
      if (mode === "run") {
        InstrumentHooks.startBenchmark();
        this.runStart = InstrumentHooks.currentTimestamp();
      }
    };

    bench.teardown = async (task, mode) => {
      if (mode === "run") {
        this.closeInstrumentWindow(this.getBenchmarkUri(task.name));
      }
      await userTeardown(task, mode);
    };
  }

  private closeInstrumentWindow(uri: string): void {
    const runEnd = InstrumentHooks.currentTimestamp();
    const pid = process.pid;

    // Benchmark markers must land inside the sample window opened by
    // startBenchmark(), so they have to be emitted before stopBenchmark()
    // closes it. The runner consumes the FIFO stream in order, so a marker
    // sent after StopBenchmark falls outside the sample and breaks the
    // expected SampleStart > BenchmarkStart > BenchmarkEnd > SampleEnd nesting.
    InstrumentHooks.addMarker(pid, MARKER_TYPE_BENCHMARK_START, this.runStart!);
    InstrumentHooks.addMarker(pid, MARKER_TYPE_BENCHMARK_END, runEnd);

    InstrumentHooks.stopBenchmark();
    InstrumentHooks.setExecutedBenchmark(pid, uri);
    this.runStart = null;
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

export default WalltimeRunner;
