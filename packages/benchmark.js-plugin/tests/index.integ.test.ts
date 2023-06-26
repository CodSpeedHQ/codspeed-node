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
  it("simple benchmark", async () => {
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
    await bench.run();
    expect(onComplete).toHaveBeenCalled();
    expect(mockCore.startInstrumentation).not.toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).not.toHaveBeenCalled();
  });
  it("check core methods are called", async () => {
    mockCore.isInstrumented.mockReturnValue(true);

    const bench = withCodSpeed(
      new Benchmark(
        "RegExpSingle",
        function () {
          /o/.test("Hello World!");
        },
        benchOptions
      )
    );
    const onComplete = jest.fn();
    bench.on("complete", onComplete);
    await bench.run();
    expect(onComplete).toHaveBeenCalled();
    expect(mockCore.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/index.integ.test.ts::RegExpSingle"
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
    await expect(bench.run()).rejects.toThrowError("test");
  });
  it.each([true, false])(
    "check console output(instrumented=%p) ",
    async (instrumented) => {
      const logSpy = jest.spyOn(console, "log");
      const warnSpy = jest.spyOn(console, "warn");
      mockCore.isInstrumented.mockReturnValue(instrumented);
      await withCodSpeed(
        new Benchmark(
          "RegExpSingle",
          function () {
            /o/.test("Hello World!");
          },
          benchOptions
        )
      ).run();
      if (instrumented) {
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "[CodSpeed] running with @codspeed/benchmark.js v"
          )
        );
        expect({
          log: logSpy.mock.calls.slice(1),
          warn: warnSpy.mock.calls,
        }).toMatchSnapshot();
      } else {
        expect({
          log: logSpy.mock.calls.slice(1),
          warn: warnSpy.mock.calls,
        }).toMatchSnapshot();
      }
    }
  );
});

describe("Benchmark.Suite", () => {
  it("simple suite", async () => {
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
    await suite.run({ maxTime: 0.1, initCount: 1 });
    expect(onComplete).toHaveBeenCalled();
    expect(mockCore.startInstrumentation).not.toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).not.toHaveBeenCalled();
  });
  it("check core methods are called", async () => {
    mockCore.isInstrumented.mockReturnValue(true);
    const suite = withCodSpeed(new Benchmark.Suite()).add(
      "RegExp",
      function () {
        /o/.test("Hello World!");
      },
      benchOptions
    );
    const onComplete = jest.fn();
    suite.on("complete", onComplete);
    await suite.run({ maxTime: 0.1, initCount: 1 });
    expect(mockCore.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/index.integ.test.ts::RegExp"
    );
  });
  it("check suite name is in the uri", async () => {
    mockCore.isInstrumented.mockReturnValue(true);
    await withCodSpeed(new Benchmark.Suite("thesuite"))
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
      "packages/benchmark.js-plugin/tests/index.integ.test.ts::thesuite::RegExp"
    );
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/index.integ.test.ts::thesuite::unknown_1"
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
    await expect(bench.run()).rejects.toThrowError("test");
  });
  it.each([true, false])(
    "check console output(instrumented=%p) ",
    async (instrumented) => {
      const logSpy = jest.spyOn(console, "log");
      const warnSpy = jest.spyOn(console, "warn");
      mockCore.isInstrumented.mockReturnValue(instrumented);
      await withCodSpeed(new Benchmark.Suite("thesuite"))
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
      if (instrumented) {
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "[CodSpeed] running with @codspeed/benchmark.js v"
          )
        );
        expect({
          log: logSpy.mock.calls.slice(1),
          warn: warnSpy.mock.calls,
        }).toMatchSnapshot();
      } else {
        expect({
          log: logSpy.mock.calls.slice(1),
          warn: warnSpy.mock.calls,
        }).toMatchSnapshot();
      }
    }
  );
});
