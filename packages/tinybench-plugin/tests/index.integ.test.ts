import { mockDeep, mockReset } from "jest-mock-extended";
const mockCore = mockDeep<Measurement>();

import type { Measurement } from "@codspeed/core";
import { Bench } from "tinybench";
import { withCodSpeed } from "..";
import { registerBenchmarks } from "./registerBenchmarks";
import { registerOtherBenchmarks } from "./registerOtherBenchmarks";

jest.mock("@codspeed/core", () => ({
  ...jest.requireActual("@codspeed/core"),
  measurement: mockCore,
}));

beforeEach(() => {
  mockReset(mockCore);
  jest.clearAllMocks();
});

describe("Benchmark.Suite", () => {
  it("simple suite", async () => {
    mockCore.isInstrumented.mockReturnValue(false);
    const bench = withCodSpeed(new Bench({ time: 100 }));
    const onComplete = jest.fn();
    bench.add("RegExp", function () {
      /o/.test("Hello World!");
    });
    bench.getTask("RegExp")?.addEventListener("complete", onComplete);
    await bench.run();

    expect(onComplete).toHaveBeenCalled();
    expect(mockCore.startInstrumentation).not.toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).not.toHaveBeenCalled();
  });
  it("check core methods are called", async () => {
    mockCore.isInstrumented.mockReturnValue(true);
    await withCodSpeed(new Bench())
      .add("RegExp", function () {
        /o/.test("Hello World!");
      })
      .run();
    expect(mockCore.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/index.integ.test.ts::RegExp"
    );
  });
  it("check suite name is in the uri", async () => {
    mockCore.isInstrumented.mockReturnValue(true);
    await withCodSpeed(new Bench())
      .add("RegExp", function () {
        /o/.test("Hello World!");
      })
      .add("RegExp2", () => {
        /o/.test("Hello World!");
      })
      .run();
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/index.integ.test.ts::RegExp"
    );
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/index.integ.test.ts::RegExp2"
    );
  });
  it("check error handling", async () => {
    mockCore.isInstrumented.mockReturnValue(true);
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
      mockCore.isInstrumented.mockReturnValue(instrumented);
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
    mockCore.isInstrumented.mockReturnValue(true);
    const bench = withCodSpeed(new Bench());
    registerBenchmarks(bench);
    await bench.run();
    expect(mockCore.startInstrumentation).toHaveBeenCalled();
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/registerBenchmarks.ts::RegExp"
    );
  });
  // TODO: this is not supported at the moment as tinybench does not support tasks with same name
  // remove `.failing` when tinybench supports it
  it.failing(
    "check that benchmarks with same name have different URIs when registered in different files",
    async () => {
      mockCore.isInstrumented.mockReturnValue(true);
      const bench = withCodSpeed(new Bench());
      registerBenchmarks(bench);
      registerOtherBenchmarks(bench);
      await bench.run();
      expect(mockCore.startInstrumentation).toHaveBeenCalled();
      expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
        "packages/tinybench-plugin/tests/registerBenchmarks.ts::RegExp"
      );
      expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
        "packages/tinybench-plugin/tests/registerOtherBenchmarks.ts::RegExp"
      );
    }
  );
});
