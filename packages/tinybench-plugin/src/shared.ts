import { Isolation, setupCore, teardownCore } from "@codspeed/core";
import { Bench, Task } from "tinybench";
import { CapturedTaskData, getTaskData } from "./taskData";
import { getTaskUri } from "./uri";

declare const __VERSION__: string;

export abstract class BaseBenchRunner {
  protected bench: Bench;
  protected rootCallingFile: string;
  /** Runners that measure pass the isolation of this process; walltime shares it. */
  private readonly isolation: Isolation;
  private readonly isChild: boolean;

  constructor(
    bench: Bench,
    rootCallingFile: string,
    isolation: Isolation = Isolation.shared(),
  ) {
    this.bench = bench;
    this.rootCallingFile = rootCallingFile;
    this.isolation = isolation;
    this.isChild = isolation.isChild();
  }

  private setupBenchRun(): void {
    setupCore();
    this.logStart();
  }

  private logStart(): void {
    // The parent already printed the banner, children stay quiet.
    if (this.isChild) {
      return;
    }
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
    // The parent already printed the summary line, children stay quiet.
    if (!this.isChild) {
      console.log(
        `[CodSpeed] Done running ${this.bench.tasks.length} benches.`,
      );
    }
    return this.bench.tasks;
  }

  protected abstract getModeName(): string;
  protected abstract runTaskAsync(task: Task, uri: string): Promise<void>;
  protected abstract runTaskSync(task: Task, uri: string): void;
  protected abstract finalizeAsyncRun(): Task[];
  protected abstract finalizeSyncRun(): Task[];

  public setupBenchMethods(): void {
    this.bench.run = async () => {
      const tasks = this.selectTasks();
      // A child that owns none of this bench's tasks must not touch the
      // instruments, the bench that owns its task does.
      if (this.isChild && tasks.length === 0) {
        return this.bench.tasks;
      }
      this.setupBenchRun();

      for (const { task, uri } of tasks) {
        await this.isolation.run(uri, () => this.runTaskAsync(task, uri));
      }

      return this.finalizeAsyncRun();
    };

    this.bench.runSync = () => {
      const tasks = this.selectTasks();
      if (this.isChild && tasks.length === 0) {
        return this.bench.tasks;
      }
      this.setupBenchRun();

      for (const { task, uri } of tasks) {
        this.isolation.runSync(uri, () => this.runTaskSync(task, uri));
      }

      return this.finalizeSyncRun();
    };
  }

  /** The tasks this process measures: all of them, or the isolated one. */
  private selectTasks(): { task: Task; uri: string }[] {
    return this.bench.tasks
      .map((task) => ({ task, uri: this.getTaskUri(task) }))
      .filter(({ uri }) => this.isolation.shouldRun(uri));
  }
}
