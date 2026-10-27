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

function runFixture({
  isolation,
  failing,
}: { isolation?: string; failing?: boolean } = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODSPEED_ENV: "true",
    CODSPEED_RUNNER_MODE: "simulation",
    ISOLATION_LOG_FILE: logFile,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import ${PRELOAD}`]
      .filter(Boolean)
      .join(" "),
  };
  env[PROCESS_ISOLATION_ENV] = isolation;
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
  it.each([
    { isolation: undefined, processes: BENCHMARK_COUNT },
    { isolation: "false", processes: 1 },
  ])(
    "measures benchmarks in $processes processes (isolation=$isolation)",
    ({ isolation, processes }) => {
      const run = runFixture({ isolation });
      expect(run.status).toBe(0);
      expect(run.pidsByUri.size).toBe(BENCHMARK_COUNT);
      const pids = new Set(run.pidsByUri.values());
      expect(pids.size).toBe(processes);
      expect(pids).not.toContain(run.parentPid);
    },
    RUN_TIMEOUT_MS,
  );

  it(
    "fails the run when an isolated benchmark throws",
    () => {
      const run = runFixture({ failing: true });
      expect(run.status).toBe(1);
    },
    RUN_TIMEOUT_MS,
  );
});
