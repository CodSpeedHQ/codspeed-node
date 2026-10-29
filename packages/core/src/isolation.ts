/**
 * Process isolation for walltime runs: every benchmark runs in fresh copies
 * of the benchmark process (forks), so the allocator state, JIT state, and
 * handles that other benchmarks or setup code leave behind can't change its
 * measurement. Rounds within one process are correlated (JIT tier-up, heap
 * sizing), so the rounds of several forks are pooled into one result.
 */
import { spawn, spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/** Isolation is on unless this is `0` or `false`. */
export const PROCESS_ISOLATION_ENV = "CODSPEED_PROCESS_ISOLATION";
/** Forks per walltime benchmark. Overrides the integration's `forks` option. */
export const WALLTIME_FORKS_ENV = "CODSPEED_WALLTIME_FORKS";
/** Forks per walltime benchmark when neither the env nor an option sets it. */
export const DEFAULT_WALLTIME_FORKS = 3;
/** Set on each fork: the URI of the only benchmark it runs. */
export const ISOLATED_BENCHMARK_ENV = "CODSPEED_ISOLATED_BENCHMARK";
/** Set on each fork: the file where it writes its round samples. */
export const FORK_SAMPLES_FILE_ENV = "CODSPEED_FORK_SAMPLES_FILE";
/**
 * JSON array `[executable, ...args]` of the command that runs the benchmarks
 * again. Integrations whose benchmarks run in a worker process (vitest) set it
 * from the main process, because re-executing the worker alone can't work.
 */
export const ISOLATION_COMMAND_ENV = "CODSPEED_ISOLATION_COMMAND";

/** Walltime settings that every integration exposes next to its own options. */
export interface WalltimeOptions {
  /**
   * Fresh processes that each walltime benchmark runs in; their rounds are
   * reported together. {@link WALLTIME_FORKS_ENV} overrides it; defaults to
   * {@link DEFAULT_WALLTIME_FORKS}. `CODSPEED_PROCESS_ISOLATION=false` runs
   * everything in the benchmark process instead.
   */
  forks?: number;
}

export type IsolationMode =
  /** All benchmarks are measured in this process. */
  | { kind: "SharedProcess" }
  /** Every benchmark is measured in `forks` fresh processes, one after the other. */
  | { kind: "Forks"; forks: number }
  /** A fork: measures only `uri` and writes its samples to `samplesFile`. */
  | { kind: "Fork"; uri: string; samplesFile: string };

/**
 * The isolation of a walltime run, from the environment. `forks` is the
 * integration's option, which {@link WALLTIME_FORKS_ENV} overrides.
 */
export function walltimeIsolation(forks?: number): IsolationMode {
  const uri = process.env[ISOLATED_BENCHMARK_ENV];
  if (uri !== undefined) {
    const samplesFile = process.env[FORK_SAMPLES_FILE_ENV];
    if (samplesFile === undefined) {
      throw new Error(
        `[CodSpeed] ${ISOLATED_BENCHMARK_ENV} is set without ${FORK_SAMPLES_FILE_ENV}`,
      );
    }
    return { kind: "Fork", uri, samplesFile };
  }
  const isolation = process.env[PROCESS_ISOLATION_ENV];
  if (isolation === "0" || isolation === "false") {
    return { kind: "SharedProcess" };
  }
  return { kind: "Forks", forks: resolveWalltimeForks(forks) };
}

/**
 * The number of forks per walltime benchmark: {@link WALLTIME_FORKS_ENV},
 * else `option`, else {@link DEFAULT_WALLTIME_FORKS}.
 */
export function resolveWalltimeForks(option?: number): number {
  const env = process.env[WALLTIME_FORKS_ENV];
  if (env !== undefined && env !== "") {
    return validForks(env, WALLTIME_FORKS_ENV);
  }
  if (option !== undefined) {
    return validForks(option, "forks");
  }
  return DEFAULT_WALLTIME_FORKS;
}

function validForks(raw: string | number, source: string): number {
  const forks = Number(raw);
  if (!Number.isInteger(forks) || forks < 1) {
    throw new Error(
      `[CodSpeed] ${source} must be a positive integer, got \`${raw}\``,
    );
  }
  return forks;
}

/**
 * Records the command of this process as the one that forks run. Call it
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
 * and returns the round samples of all of them, in milliseconds. Throws when
 * a fork fails, without running the next one.
 *
 * Each fork re-runs the benchmark command, not fork(): Node can't fork, and a
 * fork would only copy the calling thread. The fork's event loop stays free
 * while it runs: a Vitest worker must keep answering its main process, whose
 * calls time out otherwise.
 */
export async function runForks(uri: string, forks: number): Promise<number[]> {
  const dir = mkdtempSync(join(tmpdir(), SAMPLES_DIR_PREFIX));
  try {
    let samples: number[] = [];
    for (let fork = 0; fork < forks; fork++) {
      // Not push(...): spreading a time-based run's samples overflows the stack.
      samples = samples.concat(await runFork(uri, join(dir, `${fork}.json`)));
    }
    return samples;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** {@link runForks} for synchronous runs, which block anyway. */
export function runForksSync(uri: string, forks: number): number[] {
  const dir = mkdtempSync(join(tmpdir(), SAMPLES_DIR_PREFIX));
  try {
    let samples: number[] = [];
    for (let fork = 0; fork < forks; fork++) {
      samples = samples.concat(runForkSync(uri, join(dir, `${fork}.json`)));
    }
    return samples;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SAMPLES_DIR_PREFIX = "codspeed-forks-";

/** Runs one fork of `uri` and returns the samples it wrote to `file`. */
async function runFork(uri: string, file: string): Promise<number[]> {
  const [executable, ...args] = isolationCommand();
  const child = spawn(executable, args, {
    stdio: "inherit",
    env: forkEnv(uri, file),
  });
  const { promise, resolve, reject } =
    Promise.withResolvers<[number | null, NodeJS.Signals | null]>();
  child.once("error", (error) => reject(startError(uri, error)));
  child.once("close", (status, signal) => resolve([status, signal]));
  const [status, signal] = await promise;
  return forkSamples(uri, file, status, signal);
}

function runForkSync(uri: string, file: string): number[] {
  const [executable, ...args] = isolationCommand();
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    env: forkEnv(uri, file),
  });
  if (result.error !== undefined) {
    throw startError(uri, result.error);
  }
  return forkSamples(uri, file, result.status, result.signal);
}

function forkEnv(uri: string, samplesFile: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    [ISOLATED_BENCHMARK_ENV]: uri,
    [FORK_SAMPLES_FILE_ENV]: samplesFile,
  };
}

function startError(uri: string, error: Error): Error {
  return new Error(
    `[CodSpeed] failed to start the process for ${uri}: ${error.message}`,
  );
}

/** The samples a finished fork wrote; throws if it failed. */
function forkSamples(
  uri: string,
  file: string,
  status: number | null,
  signal: NodeJS.Signals | null,
): number[] {
  if (status !== 0) {
    throw new Error(
      `[CodSpeed] the process for ${uri} failed with ${signal ?? `exit code ${status}`}`,
    );
  }
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as number[];
  } catch (error) {
    throw new Error(
      `[CodSpeed] the process for ${uri} did not report its samples: ${(error as Error).message}`,
    );
  }
}

/** Hands the round samples (milliseconds) of this fork to its parent. */
export function writeForkSamples(samplesFile: string, samples: number[]) {
  writeFileSync(samplesFile, JSON.stringify(samples));
}
