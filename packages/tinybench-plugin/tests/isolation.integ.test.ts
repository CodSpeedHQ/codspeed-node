import { getV8Flags } from "@codspeed/core";
import { spawn } from "child_process";
import { once } from "events";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const FIXTURE = fileURLToPath(
  new URL("./fixtures/isolation.mjs", import.meta.url),
);
const PROCESS_ISOLATION_ENV = "CODSPEED_PROCESS_ISOLATION";
const WALLTIME_FORKS_ENV = "CODSPEED_WALLTIME_FORKS";
const BENCHMARKS = ["first", "second"];
const DEFAULT_FORKS = 3;
/** The fixture's `iterations`: every fork measures at least this many rounds. */
const MIN_ROUNDS_PER_FORK = 4;
/** Fails a run whose benchmark process got stuck instead of blocking the suite. */
const RUN_TIMEOUT_MS = 60_000;
const RAN_LINE = /^ran (\d+) (.+)$/;

interface FixtureRun {
  status: number | null;
  /** PIDs that ran each benchmark. */
  pidsByName: Map<string, Set<number>>;
  /** PID of the process the test started. */
  parentPid: number;
  /** Rounds of each benchmark in the results file. */
  roundsByName: Map<string, number>;
}

interface FixtureOptions {
  /** `CODSPEED_PROCESS_ISOLATION=false`: every benchmark shares our process. */
  shared?: boolean;
  /** `forks` option of `withCodSpeed`. */
  forksOption?: number;
  /** `CODSPEED_WALLTIME_FORKS`. */
  forksEnv?: number;
  sync?: boolean;
}

async function runFixture({
  shared,
  forksOption,
  forksEnv,
  sync,
}: FixtureOptions = {}): Promise<FixtureRun> {
  const profileFolder = mkdtempSync(join(tmpdir(), "codspeed-tinybench-"));
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
    if (forksOption !== undefined) {
      env.ISOLATION_FIXTURE_FORKS_OPTION = String(forksOption);
    }
    if (forksEnv !== undefined) {
      env[WALLTIME_FORKS_ENV] = String(forksEnv);
    }
    if (sync) {
      env.ISOLATION_FIXTURE_SYNC = "1";
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

    const pidsByName = new Map<string, Set<number>>();
    for (const line of stdout.split("\n")) {
      const match = RAN_LINE.exec(line);
      if (!match) continue;
      const pids = pidsByName.get(match[2]) ?? new Set<number>();
      pids.add(Number(match[1]));
      pidsByName.set(match[2], pids);
    }

    const roundsByName = new Map<string, number>();
    const resultsDir = join(profileFolder, "results");
    for (const file of readdirSync(resultsDir)) {
      const data = JSON.parse(readFileSync(join(resultsDir, file), "utf8"));
      for (const benchmark of data.benchmarks) {
        roundsByName.set(benchmark.name, benchmark.stats.rounds);
      }
    }
    return { status, pidsByName, parentPid: child.pid!, roundsByName };
  } finally {
    rmSync(profileFolder, { recursive: true, force: true });
  }
}

/** PIDs that ran a benchmark besides the one we started. */
function forkPids(run: FixtureRun, name: string): Set<number> {
  const pids = new Set(run.pidsByName.get(name));
  pids.delete(run.parentPid);
  return pids;
}

describe("walltime forks", () => {
  it.each([
    { name: "async", sync: false },
    { name: "sync", sync: true },
  ])(
    "runs every benchmark in 3 forks by default and pools their rounds ($name run)",
    async ({ sync }) => {
      const run = await runFixture({ sync });

      expect(run.status).toBe(0);
      for (const name of BENCHMARKS) {
        expect(forkPids(run, name).size).toBe(DEFAULT_FORKS);
        expect(run.roundsByName.get(name)).toBeGreaterThanOrEqual(
          DEFAULT_FORKS * MIN_ROUNDS_PER_FORK,
        );
      }
      // Forks of different benchmarks are different processes too.
      const all = new Set(
        BENCHMARKS.flatMap((name) => [...forkPids(run, name)]),
      );
      expect(all.size).toBe(DEFAULT_FORKS * BENCHMARKS.length);
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "takes the fork count from the withCodSpeed option",
    async () => {
      const run = await runFixture({ forksOption: 2 });

      expect(run.status).toBe(0);
      for (const name of BENCHMARKS) {
        expect(forkPids(run, name).size).toBe(2);
      }
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "takes the fork count from the environment over the option",
    async () => {
      const run = await runFixture({ forksOption: 2, forksEnv: 1 });

      expect(run.status).toBe(0);
      for (const name of BENCHMARKS) {
        expect(forkPids(run, name).size).toBe(1);
      }
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "runs every benchmark in the parent process when isolation is disabled",
    async () => {
      const run = await runFixture({ shared: true, forksEnv: 4 });

      expect(run.status).toBe(0);
      for (const name of BENCHMARKS) {
        expect(run.pidsByName.get(name)).toEqual(new Set([run.parentPid]));
      }
    },
    RUN_TIMEOUT_MS,
  );
});
