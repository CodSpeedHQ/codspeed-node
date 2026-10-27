import { getV8Flags } from "@codspeed/core";
import { spawnSync } from "child_process";
import { join } from "path";

const FIXTURE = join(__dirname, "fixtures", "isolation.cjs");
const PROCESS_ISOLATION_ENV = "CODSPEED_PROCESS_ISOLATION";
/** `first`, `second`, `third` and the deferred `async` benchmark. */
const BENCHMARK_COUNT = 4;
/** Fails a run whose benchmark process got stuck instead of blocking the suite. */
const RUN_TIMEOUT_MS = 60_000;
const EXECUTED_LINE = /^executed (\d+) (.+)$/;

interface FixtureOptions {
  /** Value of CODSPEED_PROCESS_ISOLATION, unset when undefined. */
  isolation?: string;
  failing?: boolean;
}

/** Runs the fixture and returns the PID that measured each benchmark. */
function runFixture({ isolation, failing }: FixtureOptions = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODSPEED_ENV: "true",
    CODSPEED_RUNNER_MODE: "simulation",
  };
  delete env[PROCESS_ISOLATION_ENV];
  if (isolation !== undefined) {
    env[PROCESS_ISOLATION_ENV] = isolation;
  }
  if (failing) {
    env.ISOLATION_FIXTURE_FAIL = "1";
  }

  // The runner starts Node with these flags, and children must keep them.
  const result = spawnSync(process.execPath, [...getV8Flags(), FIXTURE], {
    env,
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
  });

  const pidsByUri = new Map<string, number>();
  for (const line of result.stdout.split("\n")) {
    const match = EXECUTED_LINE.exec(line);
    if (match) {
      pidsByUri.set(match[2], Number(match[1]));
    }
  }
  return {
    status: result.status,
    stderr: result.stderr,
    pidsByUri,
    parentPid: result.pid,
  };
}

describe("process isolation", () => {
  it("measures every benchmark in its own process", () => {
    const run = runFixture();

    expect(run.status).toBe(0);
    expect(run.pidsByUri.size).toBe(BENCHMARK_COUNT);
    const pids = new Set(run.pidsByUri.values());
    expect(pids.size).toBe(BENCHMARK_COUNT);
    // The parent only spawns children, it never measures.
    expect(pids).not.toContain(run.parentPid);
  });

  it("measures all benchmarks in one process when disabled", () => {
    const run = runFixture({ isolation: "false" });

    expect(run.status).toBe(0);
    expect(run.pidsByUri.size).toBe(BENCHMARK_COUNT);
    expect(new Set(run.pidsByUri.values())).toEqual(new Set([run.parentPid]));
  });

  it("fails the run when a benchmark throws", () => {
    const run = runFixture({ isolation: "true", failing: true });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("benchmark failed");
  });
});
