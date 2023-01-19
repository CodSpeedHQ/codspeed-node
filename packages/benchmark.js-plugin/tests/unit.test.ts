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
  jest.clearAllMocks();
});

const benchOptions: Benchmark.Options = {
  maxTime: 0.01,
};

describe("Benchmark", () => {
  it("simple benchmark", () => {
    mockCore.isInstrumented.mockReturnValue(false);
    const bench = withCodSpeed(
      new Benchmark(
        "RegExp",
        function () {
          /o/.test("Hello World!");
        },
        benchOptions
      )
    );
    const onComplete = jest.fn();
    bench.on("complete", onComplete);
    bench.run();
    expect(onComplete).toHaveBeenCalled();
    expect(mockCore.startInstrumentation).not.toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).not.toHaveBeenCalled();
  });
  it("check core methods are called", () => {
    mockCore.isInstrumented.mockReturnValue(true);
    withCodSpeed(
      new Benchmark(
        "RegExpSingle",
        function () {
          /o/.test("Hello World!");
        },
        benchOptions
      )
    ).run();
    expect(mockCore.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/unit.test.ts::RegExpSingle"
    );
  });
  it("check error handling", async () => {
    mockCore.isInstrumented.mockReturnValue(true);
    const bench = withCodSpeed(
      new Benchmark(
        "throwing",
        () => {
          throw new Error("test");
        },
        benchOptions
      )
    );
    expect(() => bench.run()).toThrowError("test");
  });
  it.each([true, false])(
    "check console output(instrumented=%p) ",
    async (instrumented) => {
      const logSpy = jest.spyOn(console, "log");
      const warnSpy = jest.spyOn(console, "warn");
      mockCore.isInstrumented.mockReturnValue(instrumented);
      withCodSpeed(
        new Benchmark(
          "RegExpSingle",
          function () {
            /o/.test("Hello World!");
          },
          benchOptions
        )
      ).run();
      expect({
        log: logSpy.mock.calls,
        warn: warnSpy.mock.calls,
      }).toMatchSnapshot();
    }
  );
});

describe("Benchmark.Suite", () => {
  it("simple suite", () => {
    mockCore.isInstrumented.mockReturnValue(false);
    const suite = withCodSpeed(new Benchmark.Suite());
    suite.add(
      "RegExp",
      function () {
        /o/.test("Hello World!");
      },
      benchOptions
    );
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
      .add(
        "RegExp",
        function () {
          /o/.test("Hello World!");
        },
        benchOptions
      )
      .run();
    expect(mockCore.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/unit.test.ts::RegExp"
    );
  });
  it("check suite name is in the uri", () => {
    mockCore.isInstrumented.mockReturnValue(true);
    withCodSpeed(new Benchmark.Suite("thesuite"))
      .add(
        "RegExp",
        function () {
          /o/.test("Hello World!");
        },
        benchOptions
      )
      .add(() => {
        /o/.test("Hello World!");
      }, benchOptions)
      .run();
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/unit.test.ts::thesuite::RegExp"
    );
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/unit.test.ts::thesuite::unknown_1"
    );
  });
  it("check error handling", async () => {
    mockCore.isInstrumented.mockReturnValue(true);
    const bench = withCodSpeed(new Benchmark.Suite("thesuite")).add(
      "throwing",
      () => {
        throw new Error("test");
      }
    );
    expect(() => bench.run()).toThrowError("test");
  });
  it.each([true, false])(
    "check console output(instrumented=%p) ",
    async (instrumented) => {
      const logSpy = jest.spyOn(console, "log");
      const warnSpy = jest.spyOn(console, "warn");
      mockCore.isInstrumented.mockReturnValue(instrumented);
      withCodSpeed(new Benchmark.Suite("thesuite"))
        .add(
          "RegExp",
          function () {
            /o/.test("Hello World!");
          },
          benchOptions
        )
        .add(() => {
          /o/.test("Hello World!");
        }, benchOptions)
        .run();
      expect({
        log: logSpy.mock.calls,
        warn: warnSpy.mock.calls,
      }).toMatchSnapshot();
    }
  );
});
