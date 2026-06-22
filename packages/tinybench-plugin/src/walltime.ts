import {
  calculateQuantiles,
  InstrumentHooks,
  MARKER_TYPE_BENCHMARK_END,
  MARKER_TYPE_BENCHMARK_START,
  mongoMeasurement,
  msToNs,
  msToS,
  writeWalltimeResults,
  type BenchmarkStats,
  type Benchmark as CodspeedBenchmark,
} from "@codspeed/core";
import { Bench, Task, TaskResult } from "tinybench";
import { getBenchOptions } from "./benchOptions";
import { BaseBenchRunner } from "./shared";

export function setupCodspeedWalltimeBench(
  bench: Bench,
  rootCallingFile: string,
): void {
  const runner = new WalltimeBenchRunner(bench, rootCallingFile);
  runner.installInstrumentHooks();
  runner.setupBenchMethods();
}

class WalltimeBenchRunner extends BaseBenchRunner {
  private codspeedBenchmarks: CodspeedBenchmark[] = [];

  // Carries the window start timestamp from the setup hook to the teardown
  // hook. Tasks run strictly sequentially, so a single field is enough.
  private runStart: bigint | null = null;

  protected getModeName(): string {
    return "walltime mode";
  }

  /**
   * Drive the instrumentation window from the task's setup/teardown hooks so it
   * brackets only tinybench's measured loop, excluding warmup and the
   * statistics computation (`processRunResult`) that surround it. The user's
   * own hooks are preserved and still run in their original order relative to
   * the work under test.
   */
  public installInstrumentHooks(): void {
    // The resolved options expose `setup`/`teardown` as typed `Readonly`, but
    // tinybench populates them with (at least) no-op defaults and lets them be
    // reassigned at runtime.
    const opts = getBenchOptions(this.bench);

    // We build the walltime statistics from the per-round latency samples.
    // tinybench stopped retaining them by default in v6, so opt back in.
    opts.retainSamples = true;

    const userSetup = opts.setup;
    const userTeardown = opts.teardown;

    opts.setup = (task, mode) => {
      const setupResult = userSetup(task, mode);
      if (mode === "run") {
        InstrumentHooks.startBenchmark();
        this.runStart = InstrumentHooks.currentTimestamp();
      }
      return setupResult;
    };

    opts.teardown = (task, mode) => {
      if (mode === "run" && task) {
        const runEnd = InstrumentHooks.currentTimestamp();
        InstrumentHooks.stopBenchmark();
        InstrumentHooks.setExecutedBenchmark(
          process.pid,
          this.getTaskUri(task),
        );
        if (this.runStart !== null) {
          this.sendBenchmarkMarkers(this.runStart, runEnd);
        }

        this.runStart = null;
      }
      return userTeardown(task, mode);
    };
  }

  private sendBenchmarkMarkers(runStart: bigint, runEnd: bigint): void {
    InstrumentHooks.addMarker(
      process.pid,
      MARKER_TYPE_BENCHMARK_START,
      runStart,
    );
    InstrumentHooks.addMarker(process.pid, MARKER_TYPE_BENCHMARK_END, runEnd);
  }

  protected async runTaskAsync(task: Task, uri: string): Promise<void> {
    // run the warmup of the task right before its actual run
    if (getBenchOptions(this.bench).warmup) {
      await task.warmup();
    }

    await mongoMeasurement.start(uri);
    await task.run();
    await mongoMeasurement.stop(uri);

    this.registerCodspeedBenchmarkFromTask(task);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected runTaskSync(task: Task, _uri: string): void {
    if (getBenchOptions(this.bench).warmup) {
      task.warmupSync();
    }

    task.runSync();

    this.registerCodspeedBenchmarkFromTask(task);
  }

  protected finalizeAsyncRun(): Task[] {
    return this.finalizeWalltimeRun(true);
  }

  protected finalizeSyncRun(): Task[] {
    return this.finalizeWalltimeRun(false);
  }

  private registerCodspeedBenchmarkFromTask(task: Task): void {
    const uri = this.getTaskUri(task);

    if (!task.result) {
      console.warn(`    ⚠ No result data available for ${uri}`);
      return;
    }

    const opts = getBenchOptions(this.bench);
    const warmupIterations = opts.warmup
      ? (opts.warmupIterations ?? TINYBENCH_WARMUP_DEFAULT)
      : 0;
    const stats = convertTinybenchResultToBenchmarkStats(
      task.result,
      warmupIterations,
    );

    this.codspeedBenchmarks.push({
      name: task.name,
      uri,
      config: {
        max_rounds: opts.iterations ?? null,
        max_time_ns: opts.time ? msToNs(opts.time) : null,
        min_round_time_ns: null, // tinybench does not have an option for this
        warmup_time_ns:
          opts.warmup && opts.warmupTime ? msToNs(opts.warmupTime) : null,
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
      `[CodSpeed] Done collecting walltime data for ${this.bench.tasks.length} benches.`,
    );
    return this.bench.tasks;
  }
}

const TINYBENCH_WARMUP_DEFAULT = 16;

function convertTinybenchResultToBenchmarkStats(
  result: TaskResult,
  warmupIterations: number,
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
