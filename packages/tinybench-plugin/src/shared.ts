import { setupCore, teardownCore } from "@codspeed/core";
import { Bench, Task } from "tinybench";
import { CapturedTaskData, getTaskData } from "./taskData";
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
      `[CodSpeed] running with @codspeed/tinybench v${__VERSION__} (${this.getModeName()})`,
    );
  }

  protected getTaskUri(task: Task): string {
    return getTaskUri(this.bench, task.name, this.rootCallingFile);
  }

  protected getTaskData(task: Task): CapturedTaskData {
    const data = getTaskData(this.bench, task.name);
    if (!data) {
      throw new Error(
        `[CodSpeed] No captured function found for task "${task.name}"`,
      );
    }
    return data;
  }

  protected logTaskCompletion(uri: string, status: string): void {
    console.log(`[CodSpeed] ${status} ${uri}`);
  }

  protected finalizeBenchRun(): Task[] {
    teardownCore();
    console.log(`[CodSpeed] Done running ${this.bench.tasks.length} benches.`);
    return this.bench.tasks;
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
