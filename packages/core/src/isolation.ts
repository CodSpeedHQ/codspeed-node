/**
 * Process isolation: every benchmark runs in a fresh copy of the benchmark
 * process, so the allocator state, JIT state, and handles that other
 * benchmarks or setup code leave behind can't change its measurement.
 */
import { spawn, spawnSync } from "child_process";
import { constants } from "os";

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

/** Exit code for a child that ended with neither an exit code nor a signal. */
const GENERIC_FAILURE_EXIT_CODE = 1;
/** Shells report a child killed by signal N as exit code 128 + N. */
const SIGNAL_EXIT_CODE_OFFSET = 128;

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

  shouldRun(uri: string): boolean {
    const only = this.onlyBenchmark();
    return only === undefined || only === uri;
  }

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
        await runInChildProcessAsync(uri);
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
 * Runs the benchmark command again, limited to `uri`, and exits with the
 * child's code if it fails. Re-exec, not fork(): Node can't fork, and a fork
 * would only copy the calling thread.
 */
function runInChildProcess(uri: string): void {
  const [executable, ...args] = isolationCommand();
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    env: childEnv(uri),
  });
  if (result.error !== undefined) {
    throw startError(uri, result.error);
  }
  exitOnFailure(result.status, result.signal);
}

/**
 * {@link runInChildProcess} without blocking the event loop while the child
 * runs: a Vitest worker must keep answering its main process, whose calls
 * time out otherwise.
 */
async function runInChildProcessAsync(uri: string): Promise<void> {
  const [executable, ...args] = isolationCommand();
  const child = spawn(executable, args, {
    stdio: "inherit",
    env: childEnv(uri),
  });
  const { promise, resolve, reject } =
    Promise.withResolvers<[number | null, NodeJS.Signals | null]>();
  child.once("error", (error) => reject(startError(uri, error)));
  child.once("close", (code, signal) => resolve([code, signal]));
  const [status, signal] = await promise;
  exitOnFailure(status, signal);
}

function childEnv(uri: string): NodeJS.ProcessEnv {
  return { ...process.env, [ISOLATED_BENCHMARK_ENV]: uri };
}

function startError(uri: string, error: Error): Error {
  return new Error(
    `[CodSpeed] failed to start the process for ${uri}: ${error.message}`,
  );
}

/** Exits with a failed child's code, in the shell convention. */
function exitOnFailure(
  status: number | null,
  signal: NodeJS.Signals | null,
): void {
  if (status === 0) {
    return;
  }
  if (signal !== null) {
    process.exit(SIGNAL_EXIT_CODE_OFFSET + constants.signals[signal]);
  }
  process.exit(status ?? GENERIC_FAILURE_EXIT_CODE);
}
