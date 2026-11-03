import { getV8Flags } from "@codspeed/core";
import { spawn } from "child_process";
import { once } from "events";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const FIXTURE = fileURLToPath(
  new URL("./fixtures/batching.mjs", import.meta.url),
);
const PROCESS_ISOLATION_ENV = "CODSPEED_PROCESS_ISOLATION";
const WALLTIME_FORKS_ENV = "CODSPEED_WALLTIME_FORKS";
const FIXTURE_SYNC_ENV = "BATCHING_FIXTURE_SYNC";
/** Fails a run whose benchmark process got stuck instead of blocking the suite. */
const RUN_TIMEOUT_MS = 120_000;
const FORKS = 2;
/** Rounds the fixture's benchmarks measure per process once a round costs 1ms. */
const ROUNDS_PER_FORK = 4;
/** The fixture's iteration cost: 0.01ms on the fake clock. */
const BATCHED_ITERATION_NS = 10_000;
/** The lifecycle benchmark halves its iteration cost in the suite setup hook. */
const LIFECYCLE_ITERATION_NS = 5_000;
/** The 1ms round target in units of the fixture's iteration cost. */
const BATCHED_ITER_PER_ROUND = 100;
const LIFECYCLE_ITER_PER_ROUND = 200;
/** Allows for the fake clock's rounding, both ways, around the target count. */
const ITERATIONS_TOLERANCE = 3;

interface BenchmarkStats {
  min_ns: number;
  max_ns: number;
  mean_ns: number;
  rounds: number;
  total_time: number;
  iter_per_round: number;
  warmup_iters: number;
}

interface FixtureOptions {
  /** `CODSPEED_PROCESS_ISOLATION=false`: every benchmark shares our process. */
  shared?: boolean;
  /** `CODSPEED_WALLTIME_FORKS`. */
  forks?: number;
  sync?: boolean;
}

async function runFixture({
  shared,
  forks,
  sync,
}: FixtureOptions = {}): Promise<Map<string, BenchmarkStats>> {
  const profileFolder = mkdtempSync(join(tmpdir(), "codspeed-batching-"));
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CODSPEED_ENV: "true",
      CODSPEED_RUNNER_MODE: "walltime",
      CODSPEED_PROFILE_FOLDER: profileFolder,
    };
    delete env[PROCESS_ISOLATION_ENV];
    delete env[WALLTIME_FORKS_ENV];
    if (shared) {
      env[PROCESS_ISOLATION_ENV] = "false";
    }
    if (forks !== undefined) {
      env[WALLTIME_FORKS_ENV] = String(forks);
    }
    if (sync) {
      env[FIXTURE_SYNC_ENV] = "1";
    }

    // The runner starts Node with these flags, and forks must keep them. Not
    // spawnSync: blocking the test worker times out its calls to Vitest.
    const child = spawn(process.execPath, [...getV8Flags(), FIXTURE], {
      env,
      timeout: RUN_TIMEOUT_MS,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    const [status] = (await once(child, "close")) as [number | null];
    expect(status, stdout).toBe(0);

    const results = new Map<string, BenchmarkStats>();
    const resultsDir = join(profileFolder, "results");
    for (const file of readdirSync(resultsDir)) {
      const data = JSON.parse(readFileSync(join(resultsDir, file), "utf8")) as {
        benchmarks: { name: string; stats: BenchmarkStats }[];
      };
      for (const { name, stats } of data.benchmarks) {
        results.set(name, stats);
      }
    }
    return results;
  } finally {
    rmSync(profileFolder, { recursive: true, force: true });
  }
}

function getStats(
  results: Map<string, BenchmarkStats>,
  name: string,
): BenchmarkStats {
  const stats = results.get(name);
  if (!stats) {
    throw new Error(`no results for ${name}`);
  }
  return stats;
}

/** Every sample is one iteration, not one batch of iterations. */
function expectPerInvocationStats(
  stats: BenchmarkStats,
  perInvocationNs: number,
): void {
  expect(Math.round(stats.mean_ns)).toBe(perInvocationNs);
  expect(Math.round(stats.min_ns)).toBe(perInvocationNs);
  expect(Math.round(stats.max_ns)).toBe(perInvocationNs);
  // The total stays the raw batched time: rounds x iterations x per-iteration.
  expect(stats.total_time).toBeCloseTo(
    (stats.rounds * stats.iter_per_round * stats.mean_ns) / 1e9,
    9,
  );
}

function expectBatchedStats(
  stats: BenchmarkStats,
  {
    rounds,
    iterationsPerRound = BATCHED_ITER_PER_ROUND,
    perInvocationNs = BATCHED_ITERATION_NS,
  }: {
    rounds: number;
    iterationsPerRound?: number;
    perInvocationNs?: number;
  },
): void {
  expect(stats.iter_per_round).toBeGreaterThanOrEqual(
    iterationsPerRound - ITERATIONS_TOLERANCE,
  );
  expect(stats.iter_per_round).toBeLessThanOrEqual(
    iterationsPerRound + ITERATIONS_TOLERANCE,
  );
  expect(stats.rounds).toBe(rounds);
  expectPerInvocationStats(stats, perInvocationNs);
}

function expectHookedStats(
  stats: BenchmarkStats,
  { forks }: { forks: number },
): void {
  expect(stats.iter_per_round).toBe(1);
  // Each 0.01ms call is timed on its own, so tinybench's 1ms budget is spent.
  expect(stats.rounds).toBeGreaterThanOrEqual(98 * forks);
  expect(stats.rounds).toBeLessThanOrEqual(102 * forks);
  expectPerInvocationStats(stats, BATCHED_ITERATION_NS);
}

describe("walltime batching", () => {
  it.each([
    { name: "async", sync: false },
    { name: "sync", sync: true },
  ])(
    "batches fast benchmarks and normalizes their stats in the shared process ($name run)",
    async ({ sync }) => {
      const stats = await runFixture({ shared: true, sync });

      expectBatchedStats(getStats(stats, "batched"), {
        rounds: ROUNDS_PER_FORK,
      });
      // The suite setup hook halves the iteration cost before calibration.
      expectBatchedStats(getStats(stats, "lifecycle"), {
        rounds: ROUNDS_PER_FORK,
        iterationsPerRound: LIFECYCLE_ITER_PER_ROUND,
        perInvocationNs: LIFECYCLE_ITERATION_NS,
      });
      expect(getStats(stats, "lifecycle").warmup_iters).toBe(0);
      expectHookedStats(getStats(stats, "hooked"), { forks: 1 });

      if (!sync) {
        // An overlapping async round would have failed the fixture run.
        expectBatchedStats(getStats(stats, "async"), {
          rounds: ROUNDS_PER_FORK,
        });
      }
    },
    RUN_TIMEOUT_MS,
  );

  it.each([
    { name: "async", sync: false },
    { name: "sync", sync: true },
  ])(
    "batches and normalizes the pooled samples of several forks ($name run)",
    async ({ sync }) => {
      const stats = await runFixture({ forks: FORKS, sync });

      expectBatchedStats(getStats(stats, "batched"), {
        rounds: FORKS * ROUNDS_PER_FORK,
      });
      expectBatchedStats(getStats(stats, "lifecycle"), {
        rounds: FORKS * ROUNDS_PER_FORK,
        iterationsPerRound: LIFECYCLE_ITER_PER_ROUND,
        perInvocationNs: LIFECYCLE_ITERATION_NS,
      });
      // Batched and unbatched benchmarks pool very different sample counts.
      expectHookedStats(getStats(stats, "hooked"), { forks: FORKS });

      if (!sync) {
        expectBatchedStats(getStats(stats, "async"), {
          rounds: FORKS * ROUNDS_PER_FORK,
        });
      }
    },
    RUN_TIMEOUT_MS,
  );
});
