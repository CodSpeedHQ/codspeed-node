/* eslint-disable @typescript-eslint/no-var-requires */
export {}; // Make this a module

beforeEach(() => {
  jest.resetModules();
});

describe("with bindings", () => {
  it("should be bound", () => {
    const isBound = require("..").isBound as boolean;
    expect(isBound).toBe(true);
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
