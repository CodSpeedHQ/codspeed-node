import { mockDeep, mockReset } from "jest-mock-extended";
const mockCore = mockDeep<Measurement>();

import type { Measurement } from "@codspeed/core";
import { Bench } from "tinybench";
import { withCodSpeed } from "..";

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
      "packages/tinybench-plugin/tests/unit.test.ts::RegExp"
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
      "packages/tinybench-plugin/tests/unit.test.ts::RegExp"
    );
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/tinybench-plugin/tests/unit.test.ts::RegExp2"
    );
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
      expect({
        log: logSpy.mock.calls,
        warn: warnSpy.mock.calls,
      }).toMatchSnapshot();
    }
  );
});
