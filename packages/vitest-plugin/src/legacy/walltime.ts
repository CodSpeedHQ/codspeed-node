import { setupCore, wrapWithRootFrame } from "@codspeed/core";
import {
  RunnerTaskEventPack,
  RunnerTaskResultPack,
  type RunnerTestSuite,
} from "vitest";
import {
  installInstrumentHooks,
  writeAndLogWalltimeResults,
  type Tinybench,
  type TinybenchBench,
} from "../instrument";
import { patchRootSuiteWithFullFilePath } from "./common";
import { NodeBenchmarkRunner } from "./compat";
import { extractBenchmarkResults } from "./walltime-utils";

/** A tinybench v2 task, whose `fn` is a plain, reassignable property. */
interface TinybenchTask {
  fn: () => unknown;
}

/**
 * Lets tinybench run the benches through Vitest's default benchmark execution,
 * instrumenting each measured loop, then extracts the results from the suite
 * tree afterwards.
 */
export class WalltimeRunner extends NodeBenchmarkRunner {
  private isTinybenchHookedWithCodspeed = false;
  private suiteUris = new Map<string, string>();
  /// Suite ID of the currently running suite, to allow constructing the URI in the context of tinybench tasks
  private currentSuiteId: string | null = null;

  async runSuite(suite: RunnerTestSuite): Promise<void> {
    patchRootSuiteWithFullFilePath(suite);
    this.populateBenchmarkUris(suite);

    setupCore();

    await super.runSuite(suite);

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
   * attributed to a benchmark.
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

export default WalltimeRunner;
