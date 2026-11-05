/**
 * Process isolation for walltime runs: every benchmark runs in fresh copies
 * of the benchmark process (forks), so the allocator state, JIT state, and
 * handles that other benchmarks or setup code leave behind can't change its
 * measurement. Rounds within one process are correlated (JIT tier-up, heap
 * sizing), so the rounds of several forks are pooled into one result.
 */
import { spawn, spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deserialize, serialize } from "v8";
import { constants, gunzipSync, gzipSync } from "zlib";

/** Accepts `0`, `false`, `1`, or `true`; defaults to enabled. */
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
 * Set on the forks after the first one by {@link runForks}: the number of
 * iterations that the first fork measured per round. Every fork of a benchmark
 * MUST batch the same way, because the samples of all forks are pooled.
 */
export const FORK_ITERATIONS_PER_ROUND_ENV =
  "CODSPEED_FORK_ITERATIONS_PER_ROUND";

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
  /**
   * A fork: measures only `uri` and writes its samples to `samplesFile`. The
   * first fork picks `iterationsPerRound` itself; the ones after it inherit it.
   */
  | {
      kind: "Fork";
      uri: string;
      samplesFile: string;
      iterationsPerRound?: number;
    };

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
    const iterationsPerRound = process.env[FORK_ITERATIONS_PER_ROUND_ENV];
    return {
      kind: "Fork",
      uri,
      samplesFile,
      iterationsPerRound:
        iterationsPerRound === undefined || iterationsPerRound === ""
          ? undefined
          : validPositiveInt(iterationsPerRound, FORK_ITERATIONS_PER_ROUND_ENV),
    };
  }
  const isolation = process.env[PROCESS_ISOLATION_ENV];
  if (isolation === "0" || isolation === "false") {
    return { kind: "SharedProcess" };
  }
  if (isolation !== undefined && isolation !== "1" && isolation !== "true") {
    throw new Error(
      `[CodSpeed] ${PROCESS_ISOLATION_ENV} must be 0, false, 1, or true, got \`${isolation}\``,
    );
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
    return validPositiveInt(env, WALLTIME_FORKS_ENV);
  }
  if (option !== undefined) {
    return validPositiveInt(option, "forks");
  }
  return DEFAULT_WALLTIME_FORKS;
}

function validPositiveInt(raw: string | number, source: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `[CodSpeed] ${source} must be a positive integer, got \`${raw}\``,
    );
  }
  return value;
}

/** The command of this process, which each fork re-runs. */
function currentCommand(): string[] {
  // execArgv keeps the V8 flags (e.g. --perf-prof) that the runner set.
  return [process.execPath, ...process.execArgv, ...process.argv.slice(1)];
}

/** The pooled samples of the forks of one benchmark. */
export interface ForkSamples {
  /** Round samples (milliseconds), one per measured round. */
  samples: number[];
  /** Benchmark iterations one round measured; every fork MUST agree. */
  iterationsPerRound: number;
}

/**
 * Runs the benchmark `uri` in `forks` fresh processes, one after the other,
 * and returns the round samples of all of them, in milliseconds. Throws when
 * a fork fails, without running the next one.
 *
 * The first fork picks how many iterations one round batches; the ones after
 * it inherit that count, so the pooled samples mean the same thing.
 *
 * Each fork re-runs this process's command, not fork(): Node can't fork, and a
 * fork would only copy the calling thread. Call it from the process whose
 * command runs the benchmarks: Vitest's main process, not a worker.
 */
export async function runForks(
  uri: string,
  forks: number,
): Promise<ForkSamples> {
  let result: ForkSamples | undefined;
  for (let fork = 0; fork < forks; fork++) {
    const next = await runFork(uri, result?.iterationsPerRound);
    result = poolForkSamples(uri, result, next);
  }
  return result ?? { samples: [], iterationsPerRound: 1 };
}

/** {@link runForks} for synchronous runs, which block anyway. */
export function runForksSync(uri: string, forks: number): ForkSamples {
  let result: ForkSamples | undefined;
  for (let fork = 0; fork < forks; fork++) {
    const next = runForkSync(uri, result?.iterationsPerRound);
    result = poolForkSamples(uri, result, next);
  }
  return result ?? { samples: [], iterationsPerRound: 1 };
}

function poolForkSamples(
  uri: string,
  pooled: ForkSamples | undefined,
  next: ForkSamples,
): ForkSamples {
  if (!pooled) return next;
  if (pooled.iterationsPerRound !== next.iterationsPerRound) {
    throw new Error(
      `[CodSpeed] the forks of ${uri} measured a different number of iterations per round (${pooled.iterationsPerRound} and ${next.iterationsPerRound})`,
    );
  }
  // Not push(...): spreading a time-based run's samples overflows the stack.
  for (const sample of next.samples) pooled.samples.push(sample);
  return pooled;
}

/** A fresh file per fork: overlapping runForks() calls must not share one. */
function newSamplesFile(): string {
  return join(
    tmpdir(),
    `codspeed-samples-${process.pid}-${randomUUID()}.v8.gz`,
  );
}

/** Runs one fork of `uri` and returns the samples it wrote. */
async function runFork(
  uri: string,
  iterationsPerRound?: number,
): Promise<ForkSamples> {
  const samplesFile = newSamplesFile();
  const [executable, ...args] = currentCommand();
  const child = spawn(executable, args, {
    stdio: "inherit",
    env: forkEnv(uri, samplesFile, iterationsPerRound),
  });
  const { promise, resolve, reject } =
    Promise.withResolvers<[number | null, NodeJS.Signals | null]>();
  child.once("error", (error) => reject(startError(uri, error)));
  child.once("close", (status, signal) => resolve([status, signal]));
  const [status, signal] = await promise;
  return forkSamples(uri, samplesFile, status, signal);
}

function runForkSync(uri: string, iterationsPerRound?: number): ForkSamples {
  const samplesFile = newSamplesFile();
  const [executable, ...args] = currentCommand();
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    env: forkEnv(uri, samplesFile, iterationsPerRound),
  });
  if (result.error !== undefined) {
    throw startError(uri, result.error);
  }
  return forkSamples(uri, samplesFile, result.status, result.signal);
}

function forkEnv(
  uri: string,
  samplesFile: string,
  iterationsPerRound?: number,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    [ISOLATED_BENCHMARK_ENV]: uri,
    [FORK_SAMPLES_FILE_ENV]: samplesFile,
    [FORK_ITERATIONS_PER_ROUND_ENV]: iterationsPerRound?.toString(),
  };
}

function startError(uri: string, error: Error): Error {
  return new Error(
    `[CodSpeed] failed to start the process for ${uri}: ${error.message}`,
  );
}

/** The samples a finished fork wrote, deleting the file; throws if it failed. */
function forkSamples(
  uri: string,
  samplesFile: string,
  status: number | null,
  signal: NodeJS.Signals | null,
): ForkSamples {
  try {
    if (status !== 0) {
      throw new Error(
        `[CodSpeed] the process for ${uri} failed with ${signal ?? `exit code ${status}`}`,
      );
    }
    try {
      return deserialize(gunzipSync(readFileSync(samplesFile))) as ForkSamples;
    } catch (error) {
      throw new Error(
        `[CodSpeed] the process for ${uri} did not report its samples: ${(error as Error).message}`,
      );
    }
  } finally {
    rmSync(samplesFile, { force: true });
  }
}

/**
 * Hands round samples (milliseconds) to the parent as gzip-compressed V8 data,
 * along with the number of benchmark iterations one round measured.
 */
export function writeForkSamples(
  samplesFile: string,
  samples: number[],
  iterationsPerRound = 1,
) {
  writeFileSync(
    samplesFile,
    gzipSync(serialize({ samples, iterationsPerRound }), {
      level: constants.Z_BEST_SPEED,
    }),
  );
}
