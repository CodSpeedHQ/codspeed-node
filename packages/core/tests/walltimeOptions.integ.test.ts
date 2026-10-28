import { getV8Flags } from "../src/introspection";
import {
  WALLTIME_FORKS_ENV,
  WALLTIME_GC_BETWEEN_ROUNDS_ENV,
  getWalltimeForks,
  isGcBetweenRoundsEnabled,
} from "../src/walltime/options";

const EXPOSE_GC_FLAG = "--expose-gc";
const ENV_KEYS = [
  WALLTIME_FORKS_ENV,
  WALLTIME_GC_BETWEEN_ROUNDS_ENV,
  "CODSPEED_ENV",
  "CODSPEED_RUNNER_MODE",
];

const savedEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    setEnv(key, value);
  }
});

describe("getWalltimeForks", () => {
  it.each([undefined, ""])("returns undefined when unset (%p)", (value) => {
    setEnv(WALLTIME_FORKS_ENV, value);
    expect(getWalltimeForks()).toBeUndefined();
  });

  it("returns the number of forks", () => {
    setEnv(WALLTIME_FORKS_ENV, "3");
    expect(getWalltimeForks()).toBe(3);
  });

  it.each(["0", "-1", "1.5", "abc"])("rejects %p", (value) => {
    setEnv(WALLTIME_FORKS_ENV, value);
    expect(() => getWalltimeForks()).toThrow(WALLTIME_FORKS_ENV);
  });
});

describe("isGcBetweenRoundsEnabled", () => {
  it.each([undefined, "0", "false"])("is disabled for %p", (value) => {
    setEnv(WALLTIME_GC_BETWEEN_ROUNDS_ENV, value);
    expect(isGcBetweenRoundsEnabled()).toBe(false);
  });

  it.each(["1", "true"])("is enabled for %p", (value) => {
    setEnv(WALLTIME_GC_BETWEEN_ROUNDS_ENV, value);
    expect(isGcBetweenRoundsEnabled()).toBe(true);
  });

  it("rejects any other value", () => {
    setEnv(WALLTIME_GC_BETWEEN_ROUNDS_ENV, "maybe");
    expect(() => isGcBetweenRoundsEnabled()).toThrow(
      WALLTIME_GC_BETWEEN_ROUNDS_ENV,
    );
  });
});

describe("walltime V8 flags", () => {
  beforeEach(() => {
    setEnv("CODSPEED_ENV", "1");
    setEnv("CODSPEED_RUNNER_MODE", "walltime");
  });

  it("exposes the GC when GC between rounds is enabled", () => {
    setEnv(WALLTIME_GC_BETWEEN_ROUNDS_ENV, "true");
    expect(getV8Flags()).toContain(EXPOSE_GC_FLAG);
  });

  it("does not expose the GC otherwise", () => {
    setEnv(WALLTIME_GC_BETWEEN_ROUNDS_ENV, undefined);
    expect(getV8Flags()).not.toContain(EXPOSE_GC_FLAG);
  });
});
