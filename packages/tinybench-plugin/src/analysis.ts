import {
  getCodspeedRunnerMode,
  InstrumentHooks,
  mongoMeasurement,
  optimizeFunction,
  optimizeFunctionSync,
  wrapWithRootFrame,
  wrapWithRootFrameSync,
} from "@codspeed/core";
import { Bench, Task } from "tinybench";
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
    // Warm up through the root frame: V8 compiles it on its first call, which
    // must not land in the measurement.
    const rootFrame = wrapWithRootFrame(fn);
    await optimizeFunction(async () => {
      await fnOpts?.beforeEach?.call(task, "run");
      await rootFrame();
      await fnOpts?.afterEach?.call(task, "run");
    });
    await fnOpts?.beforeEach?.call(task, "run");
    await mongoMeasurement.start(uri);

    global.gc?.();
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

    fnOpts?.beforeAll?.call(task, "run");

    const rootFrame = wrapWithRootFrameSync(fn);
    optimizeFunctionSync(async () => {
      fnOpts?.beforeEach?.call(task, "run");
      await rootFrame();
      fnOpts?.afterEach?.call(task, "run");
    });

    fnOpts?.beforeEach?.call(task, "run");

    global.gc?.();
    InstrumentHooks.startBenchmark();
    try {
      rootFrame();
    } finally {
      InstrumentHooks.stopBenchmark();
      InstrumentHooks.setExecutedBenchmark(process.pid, uri);
    }

    fnOpts?.afterEach?.call(task, "run");
    fnOpts?.afterAll?.call(task, "run");

    this.logTaskCompletion(uri, this.taskCompletionMessage());
  }

  protected finalizeAsyncRun(): Task[] {
    return this.finalizeBenchRun();
  }

  protected finalizeSyncRun(): Task[] {
    return this.finalizeBenchRun();
  }
}
