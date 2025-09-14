import {
  InstrumentHooks,
  setupCore,
  writeWalltimeResults,
} from "@codspeed/core";
import { Fn } from "tinybench";
import {
  RunnerTaskEventPack,
  RunnerTaskResultPack,
  type RunnerTestSuite,
} from "vitest";
import { NodeBenchmarkRunner } from "vitest/runners";
import { patchRootSuiteWithFullFilePath } from "../common";
import { extractBenchmarkResults } from "./utils";

/**
 * WalltimeRunner uses Vitest's default benchmark execution
 * and extracts results from the suite after completion
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

    if (benchmarks.length > 0) {
      writeWalltimeResults(benchmarks);
      console.log(
        `[CodSpeed] Done collecting walltime data for ${benchmarks.length} benches.`
      );
    } else {
      console.warn(
        `[CodSpeed] No benchmark results found after suite execution`
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

  async importTinybench(): Promise<typeof import("tinybench")> {
    const tinybench = await super.importTinybench();

    if (this.isTinybenchHookedWithCodspeed) {
      return tinybench;
    }
    this.isTinybenchHookedWithCodspeed = true;

    const originalRun = tinybench.Task.prototype.run;

    const getSuiteUri = (): string => {
      if (this.currentSuiteId === null) {
        throw new Error("currentSuiteId is null - something went wrong");
      }
      return this.suiteUris.get(this.currentSuiteId) || "";
    };

    tinybench.Task.prototype.run = async function () {
      const { fn } = this as { fn: Fn };
      const suiteUri = getSuiteUri();

      function __codspeed_root_frame__() {
        return fn();
      }
      (this as { fn: Fn }).fn = __codspeed_root_frame__;

      InstrumentHooks.startBenchmark();
      await originalRun.call(this);
      InstrumentHooks.stopBenchmark();

      // Look up the URI by task name
      const uri = `${suiteUri}::${this.name}`;
      InstrumentHooks.setExecutedBenchmark(process.pid, uri);

      return this;
    };

    return tinybench;
  }

  // Allow tinybench to retrieve the path to the currently running suite
  async onTaskUpdate(
    _: RunnerTaskResultPack[],
    events: RunnerTaskEventPack[]
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
