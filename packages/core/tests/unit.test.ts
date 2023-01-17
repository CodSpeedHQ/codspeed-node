/* eslint-disable @typescript-eslint/no-var-requires */
import type { Measurement } from "../dist";

beforeEach(() => {
  jest.resetModules();
});

describe("with bindings", () => {
  it("should be bound", () => {
    const measurement = require("..") as Measurement;
    expect(measurement.isBound).toBe(true);
  });
});

describe("without bindings", () => {
  const initialEnv = process.env;
  beforeAll(() => {
    process.env.npm_config_arch = "unknown";
  });
  afterAll(() => {
    process.env = initialEnv;
  });
  it("should not be bound", () => {
    const measurement = require("..") as Measurement;
    expect(measurement.isBound).toBe(false);
  });
});
