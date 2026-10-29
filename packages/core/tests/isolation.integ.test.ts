import { spawnSync } from "child_process";
import { join } from "path";
import {
  FORK_SAMPLES_FILE_ENV,
  ISOLATED_BENCHMARK_ENV,
  PROCESS_ISOLATION_ENV,
  resolveWalltimeForks,
  WALLTIME_FORKS_ENV,
  walltimeIsolation,
} from "../src/isolation";

const FIXTURE = join(__dirname, "fixtures", "isolation.cjs");
/** Fails a run whose benchmark process got stuck instead of blocking the suite. */
const RUN_TIMEOUT_MS = 60_000;
const CHILD_EXIT_CODE = 3;
const RAN_LINE = /^ran (\d+) (.+)$/;
const SAMPLES_LINE = /^samples (\d+)$/;
/** Passed to Node to check that forks keep the flags of their parent. */
const NODE_FLAG = "--no-warnings";
/** Each fork of the fixture reports two samples. */
const SAMPLES_PER_FORK = 2;

const ENV_KEYS = [
  PROCESS_ISOLATION_ENV,
  ISOLATED_BENCHMARK_ENV,
  FORK_SAMPLES_FILE_ENV,
  WALLTIME_FORKS_ENV,
];
const savedEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function setEnv(env: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

afterEach(() => setEnv(savedEnv));

describe("resolveWalltimeForks", () => {
  it("defaults to 3 forks", () => {
    setEnv({});
    expect(resolveWalltimeForks()).toBe(3);
  });

  it("takes the option over the default", () => {
    setEnv({});
    expect(resolveWalltimeForks(5)).toBe(5);
  });

  it("takes the env over the option", () => {
    setEnv({ [WALLTIME_FORKS_ENV]: "2" });
    expect(resolveWalltimeForks(5)).toBe(2);
  });

  it("ignores an empty env", () => {
    setEnv({ [WALLTIME_FORKS_ENV]: "" });
    expect(resolveWalltimeForks(5)).toBe(5);
  });

  it.each(["0", "-1", "1.5", "abc"])("rejects the env %p", (value) => {
    setEnv({ [WALLTIME_FORKS_ENV]: value });
    expect(() => resolveWalltimeForks()).toThrow(WALLTIME_FORKS_ENV);
  });

  it.each([0, -1, 1.5, NaN])("rejects the option %p", (value) => {
    setEnv({});
    expect(() => resolveWalltimeForks(value)).toThrow("forks");
  });
});

describe("walltimeIsolation", () => {
  it.each([
    [undefined, "Forks"],
    ["1", "Forks"],
    ["true", "Forks"],
    ["0", "SharedProcess"],
    ["false", "SharedProcess"],
  ])("selects %s as %s", (value, kind) => {
    setEnv({ [PROCESS_ISOLATION_ENV]: value });
    expect(walltimeIsolation().kind).toBe(kind);
  });

  it("runs everything in this process when isolation is off, whatever the fork count", () => {
    setEnv({ [PROCESS_ISOLATION_ENV]: "false", [WALLTIME_FORKS_ENV]: "4" });
    expect(walltimeIsolation(2).kind).toBe("SharedProcess");
  });

  it("restricts a fork to its benchmark, whatever the isolation setting", () => {
    setEnv({
      [PROCESS_ISOLATION_ENV]: "false",
      [ISOLATED_BENCHMARK_ENV]: "file::bench",
      [FORK_SAMPLES_FILE_ENV]: "samples.json",
    });
    expect(walltimeIsolation()).toEqual({
      kind: "Fork",
      uri: "file::bench",
      samplesFile: "samples.json",
    });
  });
});

interface FixtureOptions {
  forks: number;
  action?: "exit" | "no-samples";
  sync?: boolean;
}

function runFixture({ forks, action, sync }: FixtureOptions) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ISOLATION_FIXTURE_ACTION: action,
    ISOLATION_FIXTURE_FORKS: String(forks),
  };
  for (const key of ENV_KEYS) {
    delete env[key];
  }
  if (sync) {
    env.ISOLATION_FIXTURE_SYNC = "1";
  }
  const result = spawnSync(process.execPath, [NODE_FLAG, FIXTURE], {
    env,
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
  });
  const lines = result.stdout.split("\n");
  const ran = lines
    .map((line) => RAN_LINE.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);
  const samples = lines
    .map((line) => SAMPLES_LINE.exec(line))
    .find((match) => match !== null);
  return {
    status: result.status,
    stderr: result.stderr,
    ran,
    samples: samples ? Number(samples[1]) : undefined,
  };
}

describe.each([
  { name: "async", sync: false },
  { name: "sync", sync: true },
])("runForks ($name run)", ({ sync }) => {
  it("runs every fork in a fresh process with the flags of its parent and pools their samples", () => {
    const forks = 3;
    const { status, ran, samples } = runFixture({ forks, sync });

    expect(status).toBe(0);
    expect(ran).toHaveLength(forks);
    expect(new Set(ran.map((match) => match[1])).size).toBe(forks);
    for (const match of ran) {
      expect(JSON.parse(match[2])).toEqual([NODE_FLAG]);
    }
    expect(samples).toBe(forks * SAMPLES_PER_FORK);
  });

  it("fails on a failing fork and runs no further fork", () => {
    const { status, stderr, ran, samples } = runFixture({
      forks: 3,
      sync,
      action: "exit",
    });

    expect(status).not.toBe(0);
    expect(stderr).toContain(`failed with exit code ${CHILD_EXIT_CODE}`);
    expect(ran).toHaveLength(1);
    expect(samples).toBeUndefined();
  });

  it("fails when a fork exits without reporting its samples", () => {
    const { status, stderr } = runFixture({
      forks: 2,
      sync,
      action: "no-samples",
    });

    expect(status).not.toBe(0);
    expect(stderr).toContain("did not report its samples");
  });
});
