import { mockDeep, mockReset } from "jest-mock-extended";
const mockCore = mockDeep<typeof core>();

import * as core from "@codspeed/core";
import { Bench } from "tinybench";
import { withCodSpeed } from "..";
import { registerBenchmarks } from "./registerBenchmarks";
import { registerOtherBenchmarks } from "./registerOtherBenchmarks";

jest.mock("@codspeed/core", () => mockCore);

beforeEach(() => {
  mockReset(mockCore);
  jest.clearAllMocks();
});

describe("Benchmark.Suite", () => {
  it("simple suite", async () => {
    mockCore.Measurement.isInstrumented.mockReturnValue(false);
    const bench = withCodSpeed(new Bench({ time: 100 }));
    const onComplete = jest.fn();
    bench.add("RegExp", function () {
      /o/.test("Hello World!");
    });
    bench.getTask("RegExp")?.addEventListener("complete", onComplete);
    await bench.run();

    expect(onComplete).toHaveBeenCalled();
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
      const logSpy = jest.spyOn(console, "log");
      const warnSpy = jest.spyOn(console, "warn");
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
  // remove `.failing` when tinybench supports it
  it.failing(
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
    const beforeAll = jest.fn();
    const beforeEach = jest.fn();
    const afterEach = jest.fn();
    const afterAll = jest.fn();

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

    expect(beforeAll).toHaveBeenCalledTimes(2);
    expect(beforeEach).toHaveBeenCalledTimes(2);
    expect(afterEach).toHaveBeenCalledTimes(2);
    expect(afterAll).toHaveBeenCalledTimes(2);
  });
});
