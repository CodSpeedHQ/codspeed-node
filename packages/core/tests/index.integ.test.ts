/* eslint-disable @typescript-eslint/no-require-imports */
import fs from "fs";

beforeEach(() => {
  jest.resetModules();
});

describe("with bindings", () => {
  it("should be bound", () => {
    const isBound = require("..").isBound as boolean;
    expect(isBound).toBe(true);
  });

  // Symbols in the addon are bound lazily, so a prebuild built against another
  // ABI loads without complaint and only dies once a V8 entry point runs.
  it("should write the perf map when the core is set up", () => {
    const { setupCore, teardownCore } = require("..") as {
      setupCore: () => void;
      teardownCore: () => void;
    };
    setupCore();
    teardownCore();

    const perfMap = `/tmp/perf-${process.pid}.map`;
    const entries = fs
      .readFileSync(perfMap, "utf8")
      .split("\n")
      .filter(Boolean);
    fs.unlinkSync(perfMap);
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe("without bindings", () => {
  const initialEnv = process.env;
  beforeAll(() => {
    process.env.npm_config_arch = "unknown";
    // Prevent node-gyp from falling back to a local version of the native core in packages/core/build
    process.env.PREBUILDS_ONLY = "1";
  });
  afterAll(() => {
    process.env = initialEnv;
  });
  it("should not be bound", () => {
    const isBound = require("..").isBound as boolean;
    expect(isBound).toBe(false);
  });

  it("should throw when calling setupCore", () => {
    const setupCore = require("..").setupCore as () => unknown;
    expect(setupCore).toThrowError("Native core module is not bound");
  });
});
