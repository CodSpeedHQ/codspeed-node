import { getV8Flags } from "@codspeed/core";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const FIXTURE = fileURLToPath(
  new URL("./fixtures/isolation.mjs", import.meta.url),
);
const PROCESS_ISOLATION_ENV = "CODSPEED_PROCESS_ISOLATION";
const BENCHMARK_COUNT = 3;
/** Fails a run whose benchmark process got stuck instead of blocking the suite. */
const RUN_TIMEOUT_MS = 60_000;
const EXECUTED_LINE = /^executed (\d+) (.+)$/;

interface FixtureRun {
  status: number | null;
  stderr: string;
  /** PID that measured each benchmark, in the order they were measured. */
  pidsByUri: Map<string, number>;
  /** PID of the process the test started. */
  parentPid: number;
}

interface FixtureOptions {
  /** Opt out of isolation: every benchmark shares the process we start. */
  shared?: boolean;
  failing?: boolean;
  sync?: boolean;
}

function runFixture({
  shared,
  failing,
  sync,
}: FixtureOptions = {}): FixtureRun {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODSPEED_ENV: "true",
    CODSPEED_RUNNER_MODE: "simulation",
  };
  delete env[PROCESS_ISOLATION_ENV];
  if (shared) {
    env[PROCESS_ISOLATION_ENV] = "false";
  }
  if (failing) {
    env.ISOLATION_FIXTURE_FAIL = "1";
  }
  if (sync) {
    env.ISOLATION_FIXTURE_SYNC = "1";
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

describe.each([
  { name: "async", sync: false },
  { name: "sync", sync: true },
])("process isolation ($name run)", ({ sync }) => {
  it("measures every benchmark in its own process", () => {
    const run = runFixture({ sync });

    expect(run.status).toBe(0);
    expect(run.pidsByUri.size).toBe(BENCHMARK_COUNT);
    const pids = new Set(run.pidsByUri.values());
    expect(pids.size).toBe(BENCHMARK_COUNT);
    // The parent only spawns children, it never measures.
    expect(pids).not.toContain(run.parentPid);
  });

  it("measures every benchmark in the parent process when disabled", () => {
    const run = runFixture({ shared: true, sync });

    expect(run.status).toBe(0);
    expect(run.pidsByUri.size).toBe(BENCHMARK_COUNT);
    expect(new Set(run.pidsByUri.values())).toEqual(new Set([run.parentPid]));
  });

  it("fails the run when a benchmark throws", () => {
    const run = runFixture({ failing: true, sync });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("benchmark failed");
  });
});
