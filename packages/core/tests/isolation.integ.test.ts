import { spawnSync } from "child_process";
import { constants } from "os";
import { join } from "path";
import {
  FORK_SAMPLES_FILE_ENV,
  ISOLATED_BENCHMARK_ENV,
  Isolation,
  PROCESS_ISOLATION_ENV,
} from "../src/isolation";

const FIXTURE = join(__dirname, "fixtures", "isolation.cjs");
/** Fails a run whose benchmark process got stuck instead of blocking the suite. */
const RUN_TIMEOUT_MS = 60_000;
const SIGNAL_EXIT_CODE_OFFSET = 128;
const CHILD_EXIT_CODE = 3;
const RAN_LINE = /^ran (\d+) (\S+) (.+)$/;
/** Passed to Node to check that children keep the flags of their parent. */
const NODE_FLAG = "--no-warnings";

/** `Isolation.current()` reads the environment once, so load a fresh copy. */
function currentIsolation(env: Record<string, string | undefined>): Isolation {
  const saved = process.env;
  process.env = { ...saved, ...env };
  try {
    let isolation: Isolation;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      isolation = require("../src/isolation").Isolation.current();
    });
    return isolation!;
  } finally {
    process.env = saved;
  }
}

describe("Isolation.current", () => {
  it.each([
    [undefined, "ProcessPerBenchmark"],
    ["1", "ProcessPerBenchmark"],
    ["true", "ProcessPerBenchmark"],
    ["0", "SharedProcess"],
    ["false", "SharedProcess"],
  ])("selects %s as %s", (value, kind) => {
    expect(
      currentIsolation({
        [PROCESS_ISOLATION_ENV]: value,
        [ISOLATED_BENCHMARK_ENV]: undefined,
      }).mode.kind,
    ).toBe(kind);
  });

  it("restricts a child to its benchmark, whatever the isolation setting", () => {
    const isolation = currentIsolation({
      [PROCESS_ISOLATION_ENV]: "false",
      [ISOLATED_BENCHMARK_ENV]: "file::bench",
    });

    expect(isolation.shouldRun("file::bench")).toBe(true);
    // Exact match only: a prefix is another benchmark.
    expect(isolation.shouldRun("file::bench 2")).toBe(false);
    expect(isolation.shouldRun("file")).toBe(false);
  });

  it("rejects any other value", () => {
    expect(() =>
      currentIsolation({
        [PROCESS_ISOLATION_ENV]: "maybe",
        [ISOLATED_BENCHMARK_ENV]: undefined,
      }),
    ).toThrow(`${PROCESS_ISOLATION_ENV} must be \`true\` or \`false\``);
  });
});

interface FixtureOptions {
  action?: "exit" | "kill";
  sync?: boolean;
}

function runFixture({ action, sync }: FixtureOptions = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ISOLATION_FIXTURE_ACTION: action,
  };
  delete env[PROCESS_ISOLATION_ENV];
  delete env[ISOLATED_BENCHMARK_ENV];
  if (sync) {
    env.ISOLATION_FIXTURE_SYNC = "1";
  }
  const result = spawnSync(process.execPath, [NODE_FLAG, FIXTURE], {
    env,
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
  });
  const ran = result.stdout
    .split("\n")
    .map((line) => RAN_LINE.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);
  return { status: result.status, ran };
}

describe.each([
  { name: "async", sync: false },
  { name: "sync", sync: true },
])("Isolation child process ($name run)", ({ sync }) => {
  it("runs each benchmark in a fresh process with the flags of its parent", () => {
    const { status, ran } = runFixture({ sync });

    expect(status).toBe(0);
    expect(ran.map((match) => match[2])).toEqual(["a", "b"]);
    expect(new Set(ran.map((match) => match[1])).size).toBe(2);
    for (const match of ran) {
      expect(JSON.parse(match[3])).toEqual([NODE_FLAG]);
    }
  });

  it("exits with the exit code of a failing child", () => {
    const { status, ran } = runFixture({ sync, action: "exit" });

    expect(status).toBe(CHILD_EXIT_CODE);
    // The parent stops at the first failure.
    expect(ran.map((match) => match[2])).toEqual(["a"]);
  });

  it("exits with 128 + N when a signal N killed the child", () => {
    const { status, ran } = runFixture({ sync, action: "kill" });

    expect(status).toBe(SIGNAL_EXIT_CODE_OFFSET + constants.signals.SIGKILL);
    expect(ran.map((match) => match[2])).toEqual(["a"]);
  });
});

const FORKS_FIXTURE = join(__dirname, "fixtures", "forks.cjs");
const FORK_LINE = /^fork (\d+)$/;
const SAMPLES_LINE = /^samples (\d+)$/;
const SAMPLES_PER_FORK = 2;
/** More samples than fit in the arguments of one call. */
const MANY_SAMPLES_PER_FORK = 300_000;

function runForksFixture(
  count: number,
  action?: "exit" | "no-samples",
  samplesPerFork = SAMPLES_PER_FORK,
) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FORKS_FIXTURE_COUNT: String(count),
    FORKS_FIXTURE_ACTION: action,
    FORKS_FIXTURE_SAMPLES: String(samplesPerFork),
  };
  delete env[PROCESS_ISOLATION_ENV];
  delete env[ISOLATED_BENCHMARK_ENV];
  delete env[FORK_SAMPLES_FILE_ENV];
  const result = spawnSync(process.execPath, [FORKS_FIXTURE], {
    env,
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
  });
  const lines = result.stdout.split("\n");
  const pids = lines
    .map((line) => FORK_LINE.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1]);
  const samplesMatch = lines
    .map((line) => SAMPLES_LINE.exec(line))
    .find((match) => match !== null);
  return {
    status: result.status,
    stderr: result.stderr,
    pids,
    sampleCount: samplesMatch ? Number(samplesMatch[1]) : undefined,
  };
}

describe("runForks", () => {
  it("runs each fork in a fresh process and merges their samples", () => {
    const forks = 3;
    const { status, pids, sampleCount } = runForksFixture(forks);

    expect(status).toBe(0);
    expect(new Set(pids).size).toBe(forks);
    expect(sampleCount).toBe(forks * SAMPLES_PER_FORK);
  });

  it("merges forks with many samples each", () => {
    const forks = 2;
    const { status, sampleCount } = runForksFixture(
      forks,
      undefined,
      MANY_SAMPLES_PER_FORK,
    );

    expect(status).toBe(0);
    expect(sampleCount).toBe(forks * MANY_SAMPLES_PER_FORK);
  });

  it("fails when a fork wrote no samples", () => {
    const { status, stderr, sampleCount } = runForksFixture(2, "no-samples");

    expect(status).not.toBe(0);
    expect(stderr).toContain("did not run the benchmark");
    expect(sampleCount).toBeUndefined();
  });

  it("exits with the exit code of a failing fork", () => {
    const { status, pids, sampleCount } = runForksFixture(2, "exit");

    expect(status).toBe(CHILD_EXIT_CODE);
    // The parent stops at the first failure.
    expect(pids).toHaveLength(1);
    expect(sampleCount).toBeUndefined();
  });
});
