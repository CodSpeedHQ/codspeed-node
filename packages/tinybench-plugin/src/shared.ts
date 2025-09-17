import { InstrumentHooks, setupCore, teardownCore } from "@codspeed/core";
import { Bench, Fn, Task } from "tinybench";
import { getTaskUri } from "./uri";

declare const __VERSION__: string;

export abstract class BaseBenchRunner {
  protected bench: Bench;
  protected rootCallingFile: string;

  constructor(bench: Bench, rootCallingFile: string) {
    this.bench = bench;
    this.rootCallingFile = rootCallingFile;
  }

  private setupBenchRun(): void {
    setupCore();
    this.logStart();
  }

  private logStart(): void {
    console.log(
      `[CodSpeed] running with @codspeed/tinybench v${__VERSION__} (${this.getModeName()})`
    );
  }

  protected getTaskUri(task: Task): string {
    return getTaskUri(this.bench, task.name, this.rootCallingFile);
  }

  protected logTaskCompletion(uri: string, status: string): void {
    console.log(`[CodSpeed] ${status} ${uri}`);
  }

  protected finalizeBenchRun(): Task[] {
    teardownCore();
    console.log(`[CodSpeed] Done running ${this.bench.tasks.length} benches.`);
    return this.bench.tasks;
  }

  protected wrapWithInstrumentHooks<T>(fn: () => T, uri: string): T {
    InstrumentHooks.startBenchmark();
    const result = fn();
    InstrumentHooks.stopBenchmark();
    InstrumentHooks.setExecutedBenchmark(process.pid, uri);
    return result;
  }

  protected async wrapWithInstrumentHooksAsync(
    fn: Fn,
    uri: string
  ): Promise<unknown> {
    InstrumentHooks.startBenchmark();
    const result = await fn();
    InstrumentHooks.stopBenchmark();
    InstrumentHooks.setExecutedBenchmark(process.pid, uri);
    return result;
  }

  protected abstract getModeName(): string;
  protected abstract runTaskAsync(task: Task, uri: string): Promise<void>;
  protected abstract runTaskSync(task: Task, uri: string): void;
  protected abstract finalizeAsyncRun(): Task[];
  protected abstract finalizeSyncRun(): Task[];

  public setupBenchMethods(): void {
    this.bench.run = async () => {
      this.setupBenchRun();

      for (const task of this.bench.tasks) {
        const uri = this.getTaskUri(task);
        await this.runTaskAsync(task, uri);
      }

      return this.finalizeAsyncRun();
    };

    this.bench.runSync = () => {
      this.setupBenchRun();

      for (const task of this.bench.tasks) {
        const uri = this.getTaskUri(task);
        this.runTaskSync(task, uri);
      }

      return this.finalizeSyncRun();
    };
  }
}
