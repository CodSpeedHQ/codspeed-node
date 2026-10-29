import {
  calculateQuantiles,
  FORK_BUDGET_FRACTION,
  getWalltimeForks,
  InstrumentHooks,
  isFork,
  Isolation,
  MARKER_TYPE_BENCHMARK_END,
  MARKER_TYPE_BENCHMARK_START,
  mongoMeasurement,
  msToNs,
  msToS,
  runForks,
  runForksSync,
  writeForkSamples,
  writeWalltimeResults,
  type BenchmarkStats,
  type Benchmark as CodspeedBenchmark,
} from "@codspeed/core";
import { Bench, Task } from "tinybench";
import { getBenchOptions } from "./benchOptions";
import { BaseBenchRunner } from "./shared";

export function setupCodspeedWalltimeBench(
  bench: Bench,
  rootCallingFile: string,
): void {
  // A fork runs only the benchmark its parent asked for.
  const isolation = isFork() ? Isolation.current() : Isolation.shared();
  const runner = new WalltimeBenchRunner(bench, rootCallingFile, isolation);
  runner.installInstrumentHooks();
  runner.setupBenchMethods();
}

class WalltimeBenchRunner extends BaseBenchRunner {
  private codspeedBenchmarks: CodspeedBenchmark[] = [];

  // Carries the window start timestamp from the setup hook to the teardown
  // hook. Tasks run strictly sequentially, so a single field is enough.
  private runStart: bigint | null = null;

  /** Forks per benchmark in the parent process, unset when not forking. */
  private readonly parentForks = isFork() ? undefined : getWalltimeForks();

  constructor(bench: Bench, rootCallingFile: string, isolation: Isolation) {
    super(bench, rootCallingFile, isolation);
    if (isFork() && (getWalltimeForks() ?? 1) > 1) {
      shareForkBudget(getBenchOptions(bench));
    }
  }

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
    if (this.parentForks !== undefined) {
      const samples = await runForks(uri, this.parentForks);
      this.registerCodspeedBenchmark(task, samplesToStats(samples, 0));
      return;
    }

    // run the warmup of the task right before its actual run
    if (getBenchOptions(this.bench).warmup) {
      await task.warmup();
    }

    await mongoMeasurement.start(uri);
    await task.run();
    await mongoMeasurement.stop(uri);

    this.finishTask(task);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected runTaskSync(task: Task, uri: string): void {
    if (this.parentForks !== undefined) {
      const samples = runForksSync(uri, this.parentForks);
      this.registerCodspeedBenchmark(task, samplesToStats(samples, 0));
      return;
    }

    if (getBenchOptions(this.bench).warmup) {
      task.warmupSync();
    }

    task.runSync();

    this.finishTask(task);
  }

  protected finalizeAsyncRun(): Task[] {
    return this.finalizeWalltimeRun(true);
  }

  protected finalizeSyncRun(): Task[] {
    return this.finalizeWalltimeRun(false);
  }

  /** A fork hands its samples to the parent; otherwise the task is reported. */
  private finishTask(task: Task): void {
    const uri = this.getTaskUri(task);
    if (!task.result) {
      console.warn(`    ⚠ No result data available for ${uri}`);
      return;
    }
    if (isFork()) {
      writeForkSamples([...task.result.latency.samples]);
      return;
    }
    const opts = getBenchOptions(this.bench);
    const warmupIterations = opts.warmup
      ? (opts.warmupIterations ?? TINYBENCH_WARMUP_DEFAULT)
      : 0;
    this.registerCodspeedBenchmark(
      task,
      samplesToStats(task.result.latency.samples, warmupIterations),
    );
  }

  private registerCodspeedBenchmark(task: Task, stats: BenchmarkStats): void {
    const uri = this.getTaskUri(task);
    const opts = getBenchOptions(this.bench);
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
    // Write results to JSON file using core function; forks only hand samples over.
    if (!isFork() && this.codspeedBenchmarks.length > 0) {
      writeWalltimeResults(this.codspeedBenchmarks, isAsync);
    }

    console.log(
      `[CodSpeed] Done collecting walltime data for ${this.bench.tasks.length} benches.`,
    );
    return this.bench.tasks;
  }
}

const TINYBENCH_WARMUP_DEFAULT = 16;

/**
 * Each of several forks runs a share of the warmup and measurement budget:
 * every fork pays the process startup, so full budgets would make F forks
 * cost F full runs.
 */
function shareForkBudget(opts: ReturnType<typeof getBenchOptions>): void {
  if (opts.time !== undefined) opts.time *= FORK_BUDGET_FRACTION;
  if (opts.warmupTime !== undefined) opts.warmupTime *= FORK_BUDGET_FRACTION;
  if (opts.iterations !== undefined) {
    opts.iterations = Math.ceil(opts.iterations * FORK_BUDGET_FRACTION);
  }
  if (opts.warmupIterations !== undefined) {
    opts.warmupIterations = Math.ceil(
      opts.warmupIterations * FORK_BUDGET_FRACTION,
    );
  }
}

/** Walltime statistics of round samples, in milliseconds. */
function samplesToStats(
  samples: readonly number[],
  warmupIterations: number,
): BenchmarkStats {
  const sortedTimesNs = samples.map(msToNs).sort((a, b) => a - b);
  const n = sortedTimesNs.length;
  const meanNs = sortedTimesNs.reduce((a, b) => a + b, 0) / n;
  const stdevNs =
    n > 1
      ? Math.sqrt(
          sortedTimesNs.reduce((a, x) => a + (x - meanNs) ** 2, 0) / (n - 1),
        )
      : 0;

  const { q1_ns, q3_ns, median_ns, iqr_outlier_rounds, stdev_outlier_rounds } =
    calculateQuantiles({ meanNs, stdevNs, sortedTimesNs });

  return {
    min_ns: sortedTimesNs[0],
    max_ns: sortedTimesNs[n - 1],
    mean_ns: meanNs,
    stdev_ns: stdevNs,
    q1_ns,
    median_ns,
    q3_ns,
    total_time: msToS(samples.reduce((a, b) => a + b, 0)),
    iter_per_round: 1, // as there is only one round in tinybench, we define that there were n rounds of 1 iteration
    rounds: n,
    iqr_outlier_rounds,
    stdev_outlier_rounds,
    warmup_iters: warmupIterations,
  };
}
