/**
 * Process isolation: every benchmark runs in a fresh copy of the benchmark
 * process, so the allocator state, JIT state, and handles that other
 * benchmarks or setup code leave behind can't change its measurement.
 */
import { spawnSync, type SpawnSyncReturns } from "child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { constants, tmpdir } from "os";
import { join } from "path";

/** Isolation is on unless this is `0` or `false`. */
export const PROCESS_ISOLATION_ENV = "CODSPEED_PROCESS_ISOLATION";
/** Set on each child process: the URI of the only benchmark it runs. */
export const ISOLATED_BENCHMARK_ENV = "CODSPEED_ISOLATED_BENCHMARK";
/**
 * JSON array `[executable, ...args]` of the command that runs the benchmarks
 * again. Integrations whose benchmarks run in a worker process (vitest) set it
 * from the main process, because re-executing the worker alone can't work.
 */
export const ISOLATION_COMMAND_ENV = "CODSPEED_ISOLATION_COMMAND";
/** Set on each fork of {@link runForks}: where the fork writes its samples. */
export const FORK_SAMPLES_FILE_ENV = "CODSPEED_FORK_SAMPLES_FILE";

/** Exit code for a child that ended with neither an exit code nor a signal. */
const GENERIC_FAILURE_EXIT_CODE = 1;
/** Shells report a child killed by signal N as exit code 128 + N. */
const SIGNAL_EXIT_CODE_OFFSET = 128;

/** How an integration runs each benchmark. */
export type IsolationMode =
  /** All benchmarks share this process and its state. */
  | { kind: "SharedProcess" }
  /** Every benchmark runs in its own child process. */
  | { kind: "ProcessPerBenchmark" }
  /** A child spawned in `ProcessPerBenchmark` mode, restricted to `uri`. */
  | { kind: "IsolatedBenchmark"; uri: string };

export class Isolation {
  private static instance: Isolation | undefined;
  private static readonly sharedInstance = new Isolation({
    kind: "SharedProcess",
  });

  private constructor(readonly mode: IsolationMode) {}

  /**
   * The isolation of runs where no instrument measures anything (the hooks are
   * not active), so there is nothing to isolate.
   */
  static shared(): Isolation {
    return Isolation.sharedInstance;
  }

  /** The isolation of this process, read once from the environment. */
  static current(): Isolation {
    Isolation.instance ??= new Isolation(modeFromEnv());
    return Isolation.instance;
  }

  /** The only benchmark this process may run. It overrides user filters. */
  onlyBenchmark(): string | undefined {
    switch (this.mode.kind) {
      case "IsolatedBenchmark":
        return this.mode.uri;
      case "SharedProcess":
      case "ProcessPerBenchmark":
        return undefined;
    }
  }

  /** Whether this process must run the benchmark `uri`. */
  shouldRun(uri: string): boolean {
    const only = this.onlyBenchmark();
    return only === undefined || only === uri;
  }

  /** Whether this process is a child that runs one benchmark for a parent. */
  isChild(): boolean {
    return this.onlyBenchmark() !== undefined;
  }

  /**
   * Runs the benchmark `uri`. `bench` must contain the whole measurement,
   * from `startBenchmark` to `setExecutedBenchmark`.
   */
  async run(uri: string, bench: () => Promise<void> | void): Promise<void> {
    switch (this.mode.kind) {
      case "SharedProcess":
      case "IsolatedBenchmark":
        await bench();
        return;
      case "ProcessPerBenchmark":
        runInChildProcess(uri);
        return;
    }
  }

  /** Synchronous variant of {@link Isolation.run}. */
  runSync(uri: string, bench: () => void): void {
    switch (this.mode.kind) {
      case "SharedProcess":
      case "IsolatedBenchmark":
        bench();
        return;
      case "ProcessPerBenchmark":
        runInChildProcess(uri);
        return;
    }
  }
}

function modeFromEnv(): IsolationMode {
  const uri = process.env[ISOLATED_BENCHMARK_ENV];
  if (uri !== undefined) {
    return { kind: "IsolatedBenchmark", uri };
  }

  const value = process.env[PROCESS_ISOLATION_ENV];
  switch (value) {
    case undefined:
    case "1":
    case "true":
      return { kind: "ProcessPerBenchmark" };
    case "0":
    case "false":
      return { kind: "SharedProcess" };
    default:
      throw new Error(
        `${PROCESS_ISOLATION_ENV} must be \`true\` or \`false\`, got \`${value}\``,
      );
  }
}

/**
 * Records the command of this process as the one that children run. Call it
 * from the main process of integrations that measure in worker processes. It
 * overwrites a command inherited from an outer process, which is not ours.
 */
export function recordIsolationCommand(): void {
  process.env[ISOLATION_COMMAND_ENV] = JSON.stringify(currentCommand());
}

function currentCommand(): string[] {
  // execArgv keeps the V8 flags (e.g. --perf-prof) that the runner set.
  return [process.execPath, ...process.execArgv, ...process.argv.slice(1)];
}

function isolationCommand(): string[] {
  const recorded = process.env[ISOLATION_COMMAND_ENV];
  if (recorded === undefined) {
    return currentCommand();
  }
  return JSON.parse(recorded) as string[];
}

/**
 * Runs the benchmark `uri` in `forks` fresh processes, one after the other,
 * and returns the round samples of all of them, in milliseconds. Each fork
 * measures the benchmark like an isolated child and writes its samples to the
 * file named by {@link FORK_SAMPLES_FILE_ENV} instead of reporting results.
 */
export function runForks(uri: string, forks: number): number[] {
  const dir = mkdtempSync(join(tmpdir(), "codspeed-forks-"));
  try {
    let samples: number[] = [];
    for (let fork = 0; fork < forks; fork++) {
      const file = join(dir, `${fork}.json`);
      runInChildProcess(uri, { [FORK_SAMPLES_FILE_ENV]: file });
      if (!existsSync(file)) {
        throw new Error(
          `[CodSpeed] fork ${fork + 1}/${forks} of ${uri} did not run the benchmark`,
        );
      }
      const forkSamples = (
        JSON.parse(readFileSync(file, "utf-8")) as ForkSamples
      ).samples;
      // Not push(...): spreading a time-based run's samples overflows the stack.
      samples = samples.concat(forkSamples);
    }
    return samples;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Whether this process is a fork started by {@link runForks}. */
export function isFork(): boolean {
  return process.env[FORK_SAMPLES_FILE_ENV] !== undefined;
}

/** Hands the round samples (milliseconds) of this fork to its parent. */
export function writeForkSamples(samples: number[]): void {
  const file = process.env[FORK_SAMPLES_FILE_ENV];
  if (file === undefined) {
    throw new Error(`[CodSpeed] ${FORK_SAMPLES_FILE_ENV} is not set`);
  }
  const data: ForkSamples = { samples };
  writeFileSync(file, JSON.stringify(data));
}

interface ForkSamples {
  samples: number[];
}

/**
 * Runs the benchmark command again, limited to `uri`, and exits with the
 * child's code if it fails. Re-exec, not fork(): Node can't fork, and a fork
 * would only copy the calling thread.
 */
function runInChildProcess(uri: string, env: NodeJS.ProcessEnv = {}): void {
  const [executable, ...args] = isolationCommand();
  // spawnSync blocks the event loop, so stdout written before this call is
  // already flushed and output stays in order.
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    env: { ...process.env, ...env, [ISOLATED_BENCHMARK_ENV]: uri },
  });
  if (result.error !== undefined) {
    throw new Error(
      `[CodSpeed] failed to start the process for ${uri}: ${result.error.message}`,
    );
  }
  if (result.status === 0) {
    return;
  }
  process.exit(exitCode(result));
}

/** Exit code of a failed child, in the shell convention. */
function exitCode(result: SpawnSyncReturns<Buffer>): number {
  if (result.signal !== null) {
    return SIGNAL_EXIT_CODE_OFFSET + constants.signals[result.signal];
  }
  return result.status ?? GENERIC_FAILURE_EXIT_CODE;
}
