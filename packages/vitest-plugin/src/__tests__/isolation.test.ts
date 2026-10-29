import { spawn } from "child_process";
import { once } from "events";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const FIXTURE_DIR = fileURLToPath(
  new URL("../../tests/fixtures/isolation", import.meta.url),
);
const VITEST_BIN = join(
  dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
  "vitest.mjs",
);
const PROCESS_ISOLATION_ENV = "CODSPEED_PROCESS_ISOLATION";
const WALLTIME_FORKS_ENV = "CODSPEED_WALLTIME_FORKS";
const DEFAULT_FORKS = 3;
/** The fixture's `iterations`: every fork measures at least this many rounds. */
const MIN_ROUNDS_PER_FORK = 4;
const RUN_TIMEOUT_MS = 180_000;
const RAN_LINE = /^ran (\d+) (.+)$/;

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "codspeed-isolation-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

interface FixtureOptions {
  isolation?: string;
  forksEnv?: number;
  pluginForks?: number;
  firstForks?: number;
  failing?: boolean;
}

async function runFixture(options: FixtureOptions = {}) {
  const logFile = join(tmpDir, "ran.log");
  writeFileSync(logFile, "");
  const profileFolder = join(tmpDir, "profile");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODSPEED_ENV: "true",
    CODSPEED_RUNNER_MODE: "walltime",
    CODSPEED_PROFILE_FOLDER: profileFolder,
    ISOLATION_LOG_FILE: logFile,
    [PROCESS_ISOLATION_ENV]: options.isolation,
    [WALLTIME_FORKS_ENV]: options.forksEnv?.toString(),
    ISOLATION_FIXTURE_PLUGIN_FORKS: options.pluginForks?.toString(),
    ISOLATION_FIXTURE_FIRST_FORKS: options.firstForks?.toString(),
    ISOLATION_FIXTURE_FAIL: options.failing ? "1" : undefined,
  };

  // Not spawnSync: blocking this worker times out its calls to Vitest.
  const child = spawn(process.execPath, [VITEST_BIN, "bench", "--run"], {
    cwd: FIXTURE_DIR,
    env,
    timeout: RUN_TIMEOUT_MS,
    stdio: "ignore",
  });
  const [status] = (await once(child, "close")) as [number | null];

  const pidsByName = new Map<string, Set<number>>();
  for (const line of readFileSync(logFile, "utf8").split("\n")) {
    const match = RAN_LINE.exec(line);
    if (!match) continue;
    const pids = pidsByName.get(match[2]) ?? new Set<number>();
    pids.add(Number(match[1]));
    pidsByName.set(match[2], pids);
  }

  const roundsByName = new Map<string, number>();
  const resultsDir = join(profileFolder, "results");
  for (const file of status === 0 ? readdirSync(resultsDir) : []) {
    const data = JSON.parse(readFileSync(join(resultsDir, file), "utf8"));
    for (const benchmark of data.benchmarks) {
      roundsByName.set(benchmark.name, benchmark.stats.rounds);
    }
  }
  return { status, pidsByName, roundsByName };
}

describe("walltime forks", () => {
  it(
    "runs every benchmark in 3 forks by default and pools their rounds",
    async () => {
      const run = await runFixture();

      expect(run.status).toBe(0);
      for (const name of ["first", "second"]) {
        expect(run.pidsByName.get(name)?.size).toBe(DEFAULT_FORKS);
        expect(run.roundsByName.get(name)).toBeGreaterThanOrEqual(
          DEFAULT_FORKS * MIN_ROUNDS_PER_FORK,
        );
      }
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "takes the benchmark's option over the plugin's",
    async () => {
      const run = await runFixture({ firstForks: 2, pluginForks: 1 });

      expect(run.status).toBe(0);
      expect(run.pidsByName.get("first")?.size).toBe(2);
      expect(run.pidsByName.get("second")?.size).toBe(1);
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "takes the environment over the benchmark's option",
    async () => {
      const run = await runFixture({ firstForks: 2, forksEnv: 1 });

      expect(run.status).toBe(0);
      expect(run.pidsByName.get("first")?.size).toBe(1);
      expect(run.pidsByName.get("second")?.size).toBe(1);
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "runs every benchmark in one process when isolation is disabled",
    async () => {
      const run = await runFixture({ isolation: "false" });

      expect(run.status).toBe(0);
      const pids = new Set(
        [...run.pidsByName.values()].flatMap((set) => [...set]),
      );
      expect(pids.size).toBe(1);
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "fails the run when a benchmark throws in its fork",
    async () => {
      const run = await runFixture({ failing: true, forksEnv: 1 });

      expect(run.status).not.toBe(0);
    },
    RUN_TIMEOUT_MS,
  );
});
