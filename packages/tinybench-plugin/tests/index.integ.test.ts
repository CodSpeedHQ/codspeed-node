import { Bench } from "tinybench";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCodSpeed } from "../src";
import { registerBenchmarks } from "./registerBenchmarks";
import { registerOtherBenchmarks } from "./registerOtherBenchmarks";

const mockCore = vi.hoisted(() => {
  process.env.CODSPEED_ENV = "true";
  process.env.CODSPEED_RUNNER_MODE = "instrumentation";
  return {
    mongoMeasurement: {
      start: vi.fn(),
      stop: vi.fn(),
      setupInstruments: vi.fn(),
    },
    Measurement: {
      isInstrumented: vi.fn(),
      startInstrumentation: vi.fn(),
      stopInstrumentation: vi.fn(),
    },
    optimizeFunction: vi
      .fn()
      .mockImplementation(async (fn: () => Promise<void>) => {
        await fn();
      }),
    setupCore: vi.fn(),
    teardownCore: vi.fn(),
  };
});

vi.mock("@codspeed/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@codspeed/core")>();
  return {
    ...actual,
    ...mockCore,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Benchmark.Suite", () => {
  it("simple suite", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(false);
    const bench = withCodSpeed(new Bench({ time: 100 }));
    const onComplete = vi.fn();
    bench.add("RegExp", function () {
      /o/.test("Hello World!");
    });
    bench.getTask("RegExp")?.addEventListener("complete", onComplete);
    await bench.run();

    expect(onComplete).toHaveBeenCalled();
    expect(mockCore.mongoMeasurement.start).not.toHaveBeenCalled();
    expect(mockCore.mongoMeasurement.stop).not.toHaveBeenCalled();
    expect(mockCore.Measurement.startInstrumentation).not.toHaveBeenCalled();
    expect(mockCore.Measurement.stopInstrumentation).not.toHaveBeenCalled();
  });
  it("check core methods are called", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
    await withCodSpeed(new Bench())
      .add("RegExp", function () {
        /o/.test("Hello World!");
      })
      .run();

    expect(mockCore.mongoMeasurement.start).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/index.integ.test.ts::RegExp"
    );
    expect(mockCore.mongoMeasurement.stop).toHaveBeenCalledTimes(1);
    expect(mockCore.Measurement.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/index.integ.test.ts::RegExp"
    );
  });
  it("check suite name is in the uri", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
    await withCodSpeed(new Bench())
      .add("RegExp", function () {
        /o/.test("Hello World!");
      })
      .add("RegExp2", () => {
        /o/.test("Hello World!");
      })
      .run();

    expect(mockCore.mongoMeasurement.start).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/index.integ.test.ts::RegExp"
    );
    expect(mockCore.mongoMeasurement.start).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/index.integ.test.ts::RegExp2"
    );
    expect(mockCore.mongoMeasurement.stop).toHaveBeenCalledTimes(2);
    expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/index.integ.test.ts::RegExp"
    );
    expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/index.integ.test.ts::RegExp2"
    );
  });
  it("check error handling", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
    const bench = withCodSpeed(new Bench());
    bench.add("throwing", async () => {
      throw new Error("test");
    });
    await expect(bench.run()).rejects.toThrowError("test");
  });
  it.each([true, false])(
    "check console output(instrumented=%p) ",
    async (instrumented) => {
      const logSpy = vi.spyOn(console, "log");
      const warnSpy = vi.spyOn(console, "warn");
      mockCore.Measurement.isInstrumented.mockReturnValue(instrumented);
      await withCodSpeed(new Bench({ time: 100 }))
        .add("RegExp", function () {
          /o/.test("Hello World!");
        })
        .add("RegExp2", () => {
          /o/.test("Hello World!");
        })
        .run();
      // Check that the first log contains "[CodSpeed] running with @codspeed/tinybench v"
      if (instrumented) {
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "[CodSpeed] running with @codspeed/tinybench v"
          )
        );
        expect({
          log: logSpy.mock.calls.slice(1),
          warn: warnSpy.mock.calls,
        }).toMatchSnapshot();
      } else {
        expect({
          log: logSpy.mock.calls,
          warn: warnSpy.mock.calls,
        }).toMatchSnapshot();
      }
    }
  );
  it("check nested file path is in the uri when bench is registered in another file", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
    const bench = withCodSpeed(new Bench());
    registerBenchmarks(bench);
    await bench.run();
    expect(mockCore.Measurement.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/registerBenchmarks.ts::RegExp"
    );
  });
  // TODO: this is not supported at the moment as tinybench does not support tasks with same name
  // remove `.fails` when tinybench supports it
  it.fails(
    "check that benchmarks with same name have different URIs when registered in different files",
    async () => {
      mockCore.Measurement.isInstrumented.mockReturnValue(true);
      const bench = withCodSpeed(new Bench());
      registerBenchmarks(bench);
      registerOtherBenchmarks(bench);
      await bench.run();
      expect(mockCore.Measurement.startInstrumentation).toHaveBeenCalled();
      expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
        "packages/tinybench-plugin/tests/registerBenchmarks.ts::RegExp"
      );
      expect(mockCore.Measurement.stopInstrumentation).toHaveBeenCalledWith(
        "packages/tinybench-plugin/tests/registerOtherBenchmarks.ts::RegExp"
      );
    }
  );

  it("should run before and after hooks", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
    mockCore.optimizeFunction.mockImplementation(async (fn) => {
      await fn();
    });
    const beforeAll = vi.fn();
    const beforeEach = vi.fn();
    const afterEach = vi.fn();
    const afterAll = vi.fn();

    await withCodSpeed(new Bench())
      .add(
        "RegExp",
        function () {
          /o/.test("Hello World!");
        },
        { afterAll, afterEach, beforeAll, beforeEach }
      )
      .add(
        "RegExp2",
        () => {
          /o/.test("Hello World!");
        },
        { afterAll, afterEach, beforeAll, beforeEach }
      )
      .run();

    // since the optimization is running the benchmark once before the actual run, the each hooks are called twice
    expect(beforeEach).toHaveBeenCalledTimes(4);
    expect(afterEach).toHaveBeenCalledTimes(4);

    expect(beforeAll).toHaveBeenCalledTimes(2);
    expect(afterAll).toHaveBeenCalledTimes(2);
  });

  it("should call setupCore and teardownCore only once after run()", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(true);
    const bench = withCodSpeed(new Bench())
      .add("RegExp", function () {
        /o/.test("Hello World!");
      })
      .add("RegExp2", () => {
        /o/.test("Hello World!");
      });

    expect(mockCore.setupCore).not.toHaveBeenCalled();
    expect(mockCore.teardownCore).not.toHaveBeenCalled();

    await bench.run();

    expect(mockCore.setupCore).toHaveBeenCalledTimes(1);
    expect(mockCore.teardownCore).toHaveBeenCalledTimes(1);
  });
});
