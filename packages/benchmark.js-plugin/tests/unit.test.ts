import { mockDeep, mockReset } from "jest-mock-extended";
const mockCore = mockDeep<Measurement>();

import type { Measurement } from "@codspeed/core";
import Benchmark from "benchmark";
import { withCodSpeed } from "..";

jest.mock("@codspeed/core", () => ({
  ...jest.requireActual("@codspeed/core"),
  measurement: mockCore,
}));

beforeEach(() => {
  mockReset(mockCore);
});

describe("Benchmark", () => {
  it("simple benchmark", () => {
    mockCore.isInstrumented.mockReturnValue(false);
    const bench = withCodSpeed(
      new Benchmark("RegExp", function () {
        /o/.test("Hello World!");
      })
    );
    const onComplete = jest.fn();
    bench.on("complete", onComplete);
    bench.run({
      initCount: 0,
      maxTime: -Infinity,
    });
    expect(onComplete).toHaveBeenCalled();
    expect(mockCore.startInstrumentation).not.toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).not.toHaveBeenCalled();
  });
  it("check core methods are called", () => {
    mockCore.isInstrumented.mockReturnValue(true);
    expect(mockCore.isInstrumented()).toBe(true);
    withCodSpeed(
      new Benchmark("RegExpSingle", function () {
        /o/.test("Hello World!");
      })
    ).run();
    expect(mockCore.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/unit.test.ts::RegExpSingle"
    );
  });
});

describe("Benchmark.Suite", () => {
  it("simple suite", () => {
    mockCore.isInstrumented.mockReturnValue(false);
    const suite = withCodSpeed(new Benchmark.Suite());
    suite.add("RegExp", function () {
      /o/.test("Hello World!");
    });
    const onComplete = jest.fn();
    suite.on("complete", onComplete);
    suite.run({ maxTime: 0.1, initCount: 1 });
    expect(onComplete).toHaveBeenCalled();
    expect(mockCore.startInstrumentation).not.toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).not.toHaveBeenCalled();
  });
  it("check core methods are called", () => {
    mockCore.isInstrumented.mockReturnValue(true);
    withCodSpeed(new Benchmark.Suite())
      .add("RegExp", function () {
        /o/.test("Hello World!");
      })
      .run();
    expect(mockCore.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/unit.test.ts::RegExp"
    );
  });
  it("check suite name is in the uri", () => {
    mockCore.isInstrumented.mockReturnValue(true);
    withCodSpeed(new Benchmark.Suite("thesuite"))
      .add("RegExp", function () {
        /o/.test("Hello World!");
      })
      .add(() => {
        /o/.test("Hello World!");
      })
      .run();
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/unit.test.ts::thesuite::RegExp"
    );
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/unit.test.ts::thesuite::unknown_1"
    );
  });
});
