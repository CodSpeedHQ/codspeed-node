/**
 * Process isolation: every benchmark runs in fresh copies of the benchmark
 * process (forks), so the allocator state, JIT state, and handles that other
 * benchmarks or setup code leave behind can't change its measurement. Walltime
 * rounds within one process are correlated (JIT tier-up, heap sizing), so the
 * rounds of several forks are pooled into one result. Analysis runs measure
 * each benchmark once, in one fork.
 */
import { spawn, spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deserialize, serialize } from "v8";
import { constants, gunzipSync, gzipSync } from "zlib";
import { getInstrumentMode } from "./runnerMode";

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
 * The isolation of this run, from the environment. A walltime benchmark runs
 * in `forks` forks, the integration's option, which {@link WALLTIME_FORKS_ENV}
 * overrides; an analysis benchmark is measured once, so it runs in one.
 */
export function processIsolation(forks?: number): IsolationMode {
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
  if (isolation !== undefined && isolation !== "1" && isolation !== "true") {
    throw new Error(
      `[CodSpeed] ${PROCESS_ISOLATION_ENV} must be 0, false, 1, or true, got \`${isolation}\``,
    );
  }
  const analysis = getInstrumentMode() === "analysis";
  return { kind: "Forks", forks: analysis ? 1 : resolveWalltimeForks(forks) };
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

/** The command of this process, which each fork re-runs. */
function currentCommand(): string[] {
  // execArgv keeps the V8 flags (e.g. --perf-prof) that the runner set.
  return [process.execPath, ...process.execArgv, ...process.argv.slice(1)];
}

/**
 * Runs the benchmark `uri` in `forks` fresh processes, one after the other,
 * and returns the round samples of all of them, in milliseconds. Throws when
 * a fork fails, without running the next one.
 *
 * Each fork re-runs this process's command, not fork(): Node can't fork, and a
 * fork would only copy the calling thread. Call it from the process whose
 * command runs the benchmarks: Vitest's main process, not a worker.
 */
export async function runForks(
  uri: string,
  forks: number,
): Promise<Float64Array> {
  const samples: Float64Array[] = [];
  for (let fork = 0; fork < forks; fork++) {
    samples.push(await runFork(uri));
  }
  return concatSamples(samples);
}

/** {@link runForks} for synchronous runs, which block anyway. */
export function runForksSync(uri: string, forks: number): Float64Array {
  const samples: Float64Array[] = [];
  for (let fork = 0; fork < forks; fork++) {
    samples.push(runForkSync(uri));
  }
  return concatSamples(samples);
}

/**
 * Samples stay in typed arrays: a fast benchmark records tens of millions of
 * them per fork, which as JS numbers exceed the V8 heap limit of the parent.
 */
function concatSamples(chunks: Float64Array[]): Float64Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float64Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return samples;
}

/** A fresh file per fork: overlapping runForks() calls must not share one. */
function newSamplesFile(): string {
  return join(
    tmpdir(),
    `codspeed-samples-${process.pid}-${randomUUID()}.v8.gz`,
  );
}

/** Runs one fork of `uri` and returns the samples it wrote. */
async function runFork(uri: string): Promise<Float64Array> {
  const samplesFile = newSamplesFile();
  const [executable, ...args] = currentCommand();
  const child = spawn(executable, args, {
    stdio: "inherit",
    env: forkEnv(uri, samplesFile),
  });
  const { promise, resolve, reject } =
    Promise.withResolvers<[number | null, NodeJS.Signals | null]>();
  child.once("error", (error) => reject(startError(uri, error)));
  child.once("close", (status, signal) => resolve([status, signal]));
  const [status, signal] = await promise;
  return forkSamples(uri, samplesFile, status, signal);
}

function runForkSync(uri: string): Float64Array {
  const samplesFile = newSamplesFile();
  const [executable, ...args] = currentCommand();
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    env: forkEnv(uri, samplesFile),
  });
  if (result.error !== undefined) {
    throw startError(uri, result.error);
  }
  return forkSamples(uri, samplesFile, result.status, result.signal);
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

/** The samples a finished fork wrote, deleting the file; throws if it failed. */
function forkSamples(
  uri: string,
  samplesFile: string,
  status: number | null,
  signal: NodeJS.Signals | null,
): Float64Array {
  try {
    if (status !== 0) {
      throw new Error(
        `[CodSpeed] the process for ${uri} failed with ${signal ?? `exit code ${status}`}`,
      );
    }
    try {
      return deserialize(gunzipSync(readFileSync(samplesFile))) as Float64Array;
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
 * Hands round samples (milliseconds) to the parent as gzip-compressed V8 data.
 * Analysis forks hand none: the instruments hold their measurement, and the
 * file only tells the parent that they measured their benchmark.
 */
export function writeForkSamples(
  samplesFile: string,
  samples: ArrayLike<number>,
) {
  writeFileSync(
    samplesFile,
    gzipSync(serialize(Float64Array.from(samples)), {
      level: constants.Z_BEST_SPEED,
    }),
  );
}
