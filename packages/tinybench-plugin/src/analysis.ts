import {
  getCodspeedRunnerMode,
  InstrumentHooks,
  mongoMeasurement,
  optimizeFunction,
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
    await optimizeFunction(async () => {
      await fnOpts?.beforeEach?.call(task, "run");
      await fn();
      await fnOpts?.afterEach?.call(task, "run");
    });
    await fnOpts?.beforeEach?.call(task, "run");
    await mongoMeasurement.start(uri);

    global.gc?.();
    await this.wrapWithInstrumentHooksAsync(wrapWithRootFrame(fn), uri);

    await mongoMeasurement.stop(uri);
    await fnOpts?.afterEach?.call(task, "run");
    await fnOpts?.afterAll?.call(task, "run");

    this.logTaskCompletion(uri, this.taskCompletionMessage());
  }

  protected runTaskSync(task: Task, uri: string): void {
    const { fnOpts, fn } = this.getTaskData(task);

    fnOpts?.beforeAll?.call(task, "run");
    fnOpts?.beforeEach?.call(task, "run");

    this.wrapWithInstrumentHooks(wrapWithRootFrameSync(fn), uri);

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
