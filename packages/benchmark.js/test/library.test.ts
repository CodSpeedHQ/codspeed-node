import { mockDeep, mockReset } from "jest-mock-extended";
const mockCore = mockDeep<Measurement>();

import Benchmark from "benchmark";
import { withCodSpeed } from "..";
import type { Measurement } from "@codspeed/core";

jest.mock("@codspeed/core", () => mockCore);

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
    bench.run({ maxTime: 0.1, initCount: 1 });
    expect(onComplete).toHaveBeenCalled();
    expect(mockCore.startMeasurement).not.toHaveBeenCalled();
    expect(mockCore.stopMeasurement).not.toHaveBeenCalled();
  });
  it("check core methods are called", () => {
    mockCore.isInstrumented.mockReturnValue(true);
    expect(mockCore.isInstrumented()).toBe(true);
    withCodSpeed(
      new Benchmark("RegExpSingle", function () {
        /o/.test("Hello World!");
      })
    ).run();
    expect(mockCore.startMeasurement).toHaveBeenCalled();
    expect(mockCore.stopMeasurement).toHaveBeenCalledWith(
      "packages/benchmark.js/test/library.test.ts::RegExpSingle"
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
    expect(mockCore.startMeasurement).not.toHaveBeenCalled();
    expect(mockCore.stopMeasurement).not.toHaveBeenCalled();
  });
  it("check core methods are called", () => {
    mockCore.isInstrumented.mockReturnValue(true);
    withCodSpeed(new Benchmark.Suite())
      .add("RegExp", function () {
        /o/.test("Hello World!");
      })
      .run();
    expect(mockCore.startMeasurement).toHaveBeenCalled();
    expect(mockCore.stopMeasurement).toHaveBeenCalledWith(
      "packages/benchmark.js/test/library.test.ts::RegExp"
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
    expect(mockCore.stopMeasurement).toHaveBeenCalledWith(
      "packages/benchmark.js/test/library.test.ts::thesuite::RegExp"
    );
    expect(mockCore.stopMeasurement).toHaveBeenCalledWith(
      "packages/benchmark.js/test/library.test.ts::thesuite::unknown_1"
    );
  });
});
