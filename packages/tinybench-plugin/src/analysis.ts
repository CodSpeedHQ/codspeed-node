import {
  getCodspeedRunnerMode,
  InstrumentHooks,
  mongoMeasurement,
  optimizeFunction,
  optimizeFunctionSync,
  wrapWithRootFrame,
  wrapWithRootFrameSync,
} from "@codspeed/core";
import { Bench, Task, type FnOptions } from "tinybench";
import { BaseBenchRunner } from "./shared";

export function setupCodspeedAnalysisBench(
  bench: Bench,
  rootCallingFile: string,
): void {
  const runner = new AnalysisBenchRunner(bench, rootCallingFile);
  runner.setupBenchMethods();
}

class AnalysisBenchRunner extends BaseBenchRunner {
  protected getModeName(): string {
    const runnerMode = getCodspeedRunnerMode();
    return `${runnerMode} mode`;
  }

  private taskCompletionMessage() {
    return InstrumentHooks.isInstrumented() ? "Measured" : "Checked";
  }

  protected async runTaskAsync(task: Task, uri: string): Promise<void> {
    const { fnOpts, fn } = this.getTaskData(task);

    await fnOpts?.beforeAll?.call(task, "run");
    await optimizeFunction(async () => {
      await fnOpts?.beforeEach?.call(task, "run");
      await fn();
      await fnOpts?.afterEach?.call(task, "run");
    });
    await fnOpts?.beforeEach?.call(task, "run");
    await mongoMeasurement.start(uri);

    global.gc?.();
    const rootFrame = wrapWithRootFrame(fn);
    InstrumentHooks.startBenchmark();
    try {
      await rootFrame();
    } finally {
      InstrumentHooks.stopBenchmark();
      InstrumentHooks.setExecutedBenchmark(process.pid, uri);
    }

    await mongoMeasurement.stop(uri);
    await fnOpts?.afterEach?.call(task, "run");
    await fnOpts?.afterAll?.call(task, "run");

    this.logTaskCompletion(uri, this.taskCompletionMessage());
  }

  protected runTaskSync(task: Task, uri: string): void {
    const { fnOpts, fn } = this.getTaskData(task);

    callSyncHook(task, fnOpts, "beforeAll");

    optimizeFunctionSync(() => {
      callSyncHook(task, fnOpts, "beforeEach");
      fn();
      callSyncHook(task, fnOpts, "afterEach");
    });

    callSyncHook(task, fnOpts, "beforeEach");

    global.gc?.();
    const rootFrame = wrapWithRootFrameSync(fn);
    InstrumentHooks.startBenchmark();
    try {
      rootFrame();
    } finally {
      InstrumentHooks.stopBenchmark();
      InstrumentHooks.setExecutedBenchmark(process.pid, uri);
    }

    callSyncHook(task, fnOpts, "afterEach");
    callSyncHook(task, fnOpts, "afterAll");

    this.logTaskCompletion(uri, this.taskCompletionMessage());
  }

  protected finalizeAsyncRun(): Task[] {
    return this.finalizeBenchRun();
  }

  protected finalizeSyncRun(): Task[] {
    return this.finalizeBenchRun();
  }
}

type HookName = "beforeAll" | "beforeEach" | "afterEach" | "afterAll";

/** Like tinybench's own `runSync()`: async hooks can't be awaited here. */
function callSyncHook(
  task: Task,
  fnOpts: FnOptions | undefined,
  hook: HookName,
): void {
  const result: unknown = fnOpts?.[hook]?.call(task, "run");
  if (typeof (result as PromiseLike<void> | undefined)?.then === "function") {
    throw new Error(
      `[CodSpeed] \`${hook}\` function must be sync when using \`runSync()\``,
    );
  }
}
