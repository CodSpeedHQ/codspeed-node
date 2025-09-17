import {
  calculateQuantiles,
  mongoMeasurement,
  msToNs,
  msToS,
  writeWalltimeResults,
  type Benchmark as CodspeedBenchmark,
  type BenchmarkStats,
} from "@codspeed/core";
import { Bench, Fn, Task, TaskResult } from "tinybench";
import { BaseBenchRunner } from "./shared";

export function setupCodspeedWalltimeBench(
  bench: Bench,
  rootCallingFile: string
): void {
  const runner = new WalltimeBenchRunner(bench, rootCallingFile);
  runner.setupBenchMethods();
}

class WalltimeBenchRunner extends BaseBenchRunner {
  private codspeedBenchmarks: CodspeedBenchmark[] = [];

  protected getModeName(): string {
    return "walltime mode";
  }

  protected async runTaskAsync(task: Task, uri: string): Promise<void> {
    // Override the function under test to add a static frame
    this.wrapTaskFunction(task, true);

    // run the warmup of the task right before its actual run
    if (this.bench.opts.warmup) {
      await task.warmup();
    }

    await mongoMeasurement.start(uri);
    await this.wrapWithInstrumentHooksAsync(() => task.run(), uri);
    await mongoMeasurement.stop(uri);

    this.registerCodspeedBenchmarkFromTask(task);
  }

  protected runTaskSync(task: Task, uri: string): void {
    // Override the function under test to add a static frame
    this.wrapTaskFunction(task, false);

    if (this.bench.opts.warmup) {
      task.warmup();
    }

    this.wrapWithInstrumentHooks(() => task.runSync(), uri);

    this.registerCodspeedBenchmarkFromTask(task);
  }

  protected finalizeAsyncRun(): Task[] {
    return this.finalizeWalltimeRun(true);
  }

  protected finalizeSyncRun(): Task[] {
    return this.finalizeWalltimeRun(false);
  }

  private wrapTaskFunction(task: Task, isAsync: boolean): void {
    const { fn } = task as unknown as { fn: Fn };
    if (isAsync) {
      // eslint-disable-next-line no-inner-declarations
      async function __codspeed_root_frame__() {
        await fn();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (task as any).fn = __codspeed_root_frame__;
    } else {
      // eslint-disable-next-line no-inner-declarations
      function __codspeed_root_frame__() {
        fn();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (task as any).fn = __codspeed_root_frame__;
    }
  }

  private registerCodspeedBenchmarkFromTask(task: Task): void {
    const uri = this.getTaskUri(task);

    if (!task.result) {
      console.warn(`    ⚠ No result data available for ${uri}`);
      return;
    }

    const warmupIterations = this.bench.opts.warmup
      ? this.bench.opts.warmupIterations ?? TINYBENCH_WARMUP_DEFAULT
      : 0;
    const stats = convertTinybenchResultToBenchmarkStats(
      task.result,
      warmupIterations
    );

    this.codspeedBenchmarks.push({
      name: task.name,
      uri,
      config: {
        max_rounds: this.bench.opts.iterations ?? null,
        max_time_ns: this.bench.opts.time ? msToNs(this.bench.opts.time) : null,
        min_round_time_ns: null, // tinybench does not have an option for this
        warmup_time_ns:
          this.bench.opts.warmup && this.bench.opts.warmupTime
            ? msToNs(this.bench.opts.warmupTime)
            : null,
      },
      stats,
    });

    this.logTaskCompletion(uri, "Collected walltime data for");
  }

  private finalizeWalltimeRun(isAsync: boolean): Task[] {
    // Write results to JSON file using core function
    if (this.codspeedBenchmarks.length > 0) {
      writeWalltimeResults(this.codspeedBenchmarks, isAsync);
    }

    console.log(
      `[CodSpeed] Done collecting walltime data for ${this.bench.tasks.length} benches.`
    );
    return this.bench.tasks;
  }
}

const TINYBENCH_WARMUP_DEFAULT = 16;

function convertTinybenchResultToBenchmarkStats(
  result: TaskResult,
  warmupIterations: number
): BenchmarkStats {
  const { min, max, mean, sd, samples } = result.latency;

  // Get individual sample times in nanoseconds and sort them
  const sortedTimesNs = samples.map(msToNs).sort((a, b) => a - b);
  const meanNs = msToNs(mean);
  const stdevNs = msToNs(sd);

  const { q1_ns, q3_ns, median_ns, iqr_outlier_rounds, stdev_outlier_rounds } =
    calculateQuantiles({ meanNs, stdevNs, sortedTimesNs });

  return {
    min_ns: msToNs(min),
    max_ns: msToNs(max),
    mean_ns: meanNs,
    stdev_ns: stdevNs,
    q1_ns,
    median_ns,
    q3_ns,
    total_time: msToS(result.totalTime),
    iter_per_round: 1, // as there is only one round in tinybench, we define that there were n rounds of 1 iteration
    rounds: sortedTimesNs.length,
    iqr_outlier_rounds,
    stdev_outlier_rounds,
    warmup_iters: warmupIterations,
  };
}
