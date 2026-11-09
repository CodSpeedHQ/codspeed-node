import {
  getCodspeedRunnerMode,
  InstrumentHooks,
  mongoMeasurement,
  optimizeFunction,
  optimizeFunctionSync,
  wrapWithRootFrame,
  wrapWithRootFrameSync,
  writeForkSamples,
  type IsolationMode,
} from "@codspeed/core";
import { Bench, Task } from "tinybench";
import { BaseBenchRunner } from "./shared";

export function setupCodspeedAnalysisBench(
  bench: Bench,
  rootCallingFile: string,
  isolationMode: IsolationMode,
): void {
  const runner = new AnalysisBenchRunner(bench, rootCallingFile, isolationMode);
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

  private completeTask(uri: string): void {
    this.logTaskCompletion(uri, this.taskCompletionMessage());
    if (this.isolationMode.kind === "Fork") {
      writeForkSamples(this.isolationMode.samplesFile, []);
    }
  }

  /** The instruments hold the measurement of the forks. */
  protected collectForks(): void {}

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

    this.completeTask(uri);
  }

  protected runTaskSync(task: Task, uri: string): void {
    const { fnOpts, fn } = this.getTaskData(task);

    fnOpts?.beforeAll?.call(task, "run");

    optimizeFunctionSync(() => {
      fnOpts?.beforeEach?.call(task, "run");
      fn();
      fnOpts?.afterEach?.call(task, "run");
    });

    fnOpts?.beforeEach?.call(task, "run");

    global.gc?.();
    const rootFrame = wrapWithRootFrameSync(fn);
    InstrumentHooks.startBenchmark();
    try {
      rootFrame();
    } finally {
      InstrumentHooks.stopBenchmark();
      InstrumentHooks.setExecutedBenchmark(process.pid, uri);
    }

    fnOpts?.afterEach?.call(task, "run");
    fnOpts?.afterAll?.call(task, "run");

    this.completeTask(uri);
  }

  protected finalizeAsyncRun(): Task[] {
    return this.finalizeBenchRun();
  }

  protected finalizeSyncRun(): Task[] {
    return this.finalizeBenchRun();
  }
}
