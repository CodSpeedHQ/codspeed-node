import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const FIXTURE_DIR = fileURLToPath(
  new URL("../../tests/fixtures/isolation", import.meta.url),
);
const PRELOAD = join(FIXTURE_DIR, "stub.mjs");
const VITEST_BIN = join(
  dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
  "vitest.mjs",
);
const PROCESS_ISOLATION_ENV = "CODSPEED_PROCESS_ISOLATION";
const BENCHMARK_COUNT = 3;
/** Fails a run whose benchmark process got stuck instead of blocking the suite. */
const RUN_TIMEOUT_MS = 120_000;
const EXECUTED_LINE = /^executed (\d+) (.+)$/;

let logDir: string;
let logFile: string;

beforeEach(() => {
  logDir = mkdtempSync(join(tmpdir(), "codspeed-isolation-"));
  logFile = join(logDir, "executed.log");
});

afterEach(() => {
  rmSync(logDir, { recursive: true, force: true });
});

interface FixtureOptions {
  /** Value of CODSPEED_PROCESS_ISOLATION, unset when undefined. */
  isolation?: string;
  failing?: boolean;
}

/** Runs `vitest bench` on the fixture project and returns what it measured. */
function runFixture({ isolation, failing }: FixtureOptions = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODSPEED_ENV: "true",
    CODSPEED_RUNNER_MODE: "simulation",
    ISOLATION_LOG_FILE: logFile,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import ${PRELOAD}`]
      .filter(Boolean)
      .join(" "),
  };
  delete env[PROCESS_ISOLATION_ENV];
  if (isolation !== undefined) {
    env[PROCESS_ISOLATION_ENV] = isolation;
  }
  if (failing) {
    env.ISOLATION_FIXTURE_FAIL = "1";
  }

  const result = spawnSync(process.execPath, [VITEST_BIN, "bench", "--run"], {
    cwd: FIXTURE_DIR,
    env,
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
  });

  const pidsByUri = new Map<string, number>();
  for (const line of readFileSync(logFile, "utf8").split("\n")) {
    const match = EXECUTED_LINE.exec(line);
    if (match) {
      pidsByUri.set(match[2], Number(match[1]));
    }
  }
  return { status: result.status, pidsByUri, parentPid: result.pid };
}

describe("process isolation", () => {
  it.each([undefined, "1", "true"])(
    "measures every benchmark in its own process (isolation=%s)",
    (isolation) => {
      const run = runFixture({ isolation });

      expect(run.status).toBe(0);
      expect(run.pidsByUri.size).toBe(BENCHMARK_COUNT);
      const pids = new Set(run.pidsByUri.values());
      expect(pids.size).toBe(BENCHMARK_COUNT);
      expect(pids).not.toContain(run.parentPid);
    },
    RUN_TIMEOUT_MS,
  );

  it.each(["0", "false"])(
    "measures all benchmarks in one process (isolation=%s)",
    (isolation) => {
      const run = runFixture({ isolation });

      expect(run.status).toBe(0);
      expect(run.pidsByUri.size).toBe(BENCHMARK_COUNT);
      expect(new Set(run.pidsByUri.values()).size).toBe(1);
    },
    RUN_TIMEOUT_MS,
  );

  it.each(["true", "false"])(
    "fails the run when a benchmark throws (isolation=%s)",
    (isolation) => {
      const run = runFixture({ isolation, failing: true });

      expect(run.status).not.toBe(0);
    },
    RUN_TIMEOUT_MS,
  );
});
