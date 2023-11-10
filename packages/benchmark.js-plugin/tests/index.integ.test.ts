import { mockDeep, mockReset } from "jest-mock-extended";
const mockCore = mockDeep<typeof core>();

import * as core from "@codspeed/core";
import Benchmark from "benchmark";
import { withCodSpeed } from "..";
import { registerBenchmarks } from "./registerBenchmarks";
import { registerOtherBenchmarks } from "./registerOtherBenchmarks";

jest.mock("@codspeed/core", () => {
  mockCore.getGitDir = jest.requireActual("@codspeed/core").getGitDir;
  return mockCore;
});

beforeEach(() => {
  mockReset(mockCore);
  jest.clearAllMocks();
});

const benchOptions: Benchmark.Options = {
  maxTime: 0.01,
};

describe("Benchmark", () => {
  it("simple benchmark", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(false);
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
    expect(mockCore.Measurement.startInstrumentation).not.toHaveBeenCalled();
    expect(mockCore.Measurement.stopInstrumentation).not.toHaveBeenCalled();
  });
  it("check core methods are called", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);

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
    expect(mockCore.Measurement.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/index.integ.test.ts::RegExpSingle"
    );
  });
  it("check error handling", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
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
      mockCore.Measurement.isInstrumented.mockReturnValue(instrumented);
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
  it("should call setup and teardown", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
    const setup = jest.fn();
    const teardown = jest.fn();
    const bench = withCodSpeed(
      new Benchmark(
        "RegExpSingle",
        function () {
          /o/.test("Hello World!");
        },
        { ...benchOptions, setup, teardown }
      )
    );
    await bench.run();
    expect(setup).toHaveBeenCalled();
    expect(teardown).toHaveBeenCalled();
  });
});

describe("Benchmark.Suite", () => {
  it("simple suite", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(false);
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
    expect(mockCore.Measurement.startInstrumentation).not.toHaveBeenCalled();
    expect(mockCore.Measurement.stopInstrumentation).not.toHaveBeenCalled();
  });
  it("check core methods are called", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
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
    expect(mockCore.Measurement.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/index.integ.test.ts::RegExp"
    );
  });
  it("check suite name is in the uri", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
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
    expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/index.integ.test.ts::thesuite::RegExp"
    );
    expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/index.integ.test.ts::thesuite::unknown_1"
    );
  });
  it("check error handling", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
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
      mockCore.Measurement.isInstrumented.mockReturnValue(instrumented);
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
  it("check nested file path is in the uri when bench is registered in another file", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
    const suite = withCodSpeed(new Benchmark.Suite("thesuite"));
    registerBenchmarks(suite);
    const onComplete = jest.fn();
    suite.on("complete", onComplete);
    await suite.run({ maxTime: 0.1, initCount: 1 });
    expect(mockCore.Measurement.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/registerBenchmarks.ts::thesuite::RegExp"
    );
  });
  it("check that benchmarks with same name have different URIs when registered in different files", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
    const suite = withCodSpeed(new Benchmark.Suite("thesuite"));
    registerBenchmarks(suite);
    registerOtherBenchmarks(suite);
    const onComplete = jest.fn();
    suite.on("complete", onComplete);
    await suite.run({ maxTime: 0.1, initCount: 1 });
    expect(mockCore.Measurement.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/registerBenchmarks.ts::thesuite::RegExp"
    );
    expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
      "packages/benchmark.js-plugin/tests/registerOtherBenchmarks.ts::thesuite::RegExp"
    );
  });
  it("should call setupCore and teardownCore only once after run()", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
    const suite = withCodSpeed(new Benchmark.Suite("thesuite"));
    registerBenchmarks(suite);
    registerOtherBenchmarks(suite);

    expect(mockCore.setupCore).not.toHaveBeenCalled();
    expect(mockCore.teardownCore).not.toHaveBeenCalled();

    await suite.run({ maxTime: 0.1, initCount: 1 });

    expect(mockCore.setupCore).toHaveBeenCalledTimes(1);
    expect(mockCore.teardownCore).toHaveBeenCalledTimes(1);
  });
  it("should call setup and teardown", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
    const setup = jest.fn();
    const teardown = jest.fn();

    const suite = withCodSpeed(new Benchmark.Suite("thesuite")).add(
      "RegExpSingle",
      function () {
        /o/.test("Hello World!");
      },
      { ...benchOptions, setup, teardown }
    );
    await suite.run();

    expect(setup).toHaveBeenCalled();
    expect(teardown).toHaveBeenCalled();
  });
});
