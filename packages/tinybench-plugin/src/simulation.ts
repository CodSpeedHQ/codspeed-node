import {
  InstrumentHooks,
  mongoMeasurement,
  optimizeFunction,
} from "@codspeed/core";
import { Bench, Fn, FnOptions, Task } from "tinybench";
import { BaseBenchRunner } from "./shared";

export function setupCodspeedSimulationBench(
  bench: Bench,
  rootCallingFile: string
): void {
  const runner = new SimulationBenchRunner(bench, rootCallingFile);
  runner.setupBenchMethods();
}

class SimulationBenchRunner extends BaseBenchRunner {
  protected getModeName(): string {
    return "simulation mode";
  }

  private taskCompletionMessage() {
    return InstrumentHooks.isInstrumented() ? "Measured" : "Checked";
  }

  private wrapFunctionWithFrame(fn: Fn, isAsync: boolean): Fn {
    if (isAsync) {
      return async function __codspeed_root_frame__() {
        await fn();
      };
    } else {
      return function __codspeed_root_frame__() {
        fn();
      };
    }
  }

  protected async runTaskAsync(task: Task, uri: string): Promise<void> {
    const { fnOpts, fn } = task as unknown as { fnOpts?: FnOptions; fn: Fn };

    await fnOpts?.beforeAll?.call(task, "run");
    await optimizeFunction(async () => {
      await fnOpts?.beforeEach?.call(task, "run");
      await fn();
      await fnOpts?.afterEach?.call(task, "run");
    });
    await fnOpts?.beforeEach?.call(task, "run");
    await mongoMeasurement.start(uri);

    global.gc?.();
    await this.wrapWithInstrumentHooksAsync(
      this.wrapFunctionWithFrame(fn, true),
      uri
    );

    await mongoMeasurement.stop(uri);
    await fnOpts?.afterEach?.call(task, "run");
    await fnOpts?.afterAll?.call(task, "run");

    this.logTaskCompletion(uri, this.taskCompletionMessage());
  }

  protected runTaskSync(task: Task, uri: string): void {
    const { fnOpts, fn } = task as unknown as { fnOpts?: FnOptions; fn: Fn };

    fnOpts?.beforeAll?.call(task, "run");
    fnOpts?.beforeEach?.call(task, "run");

    this.wrapWithInstrumentHooks(this.wrapFunctionWithFrame(fn, false), uri);

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
