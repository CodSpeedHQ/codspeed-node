import { mockDeep, mockReset } from "jest-mock-extended";
const mockCore = mockDeep<Measurement>();

import { Bench } from "tinybench";
import { withCodSpeed } from "..";
import type { Measurement } from "@codspeed/core";

jest.mock("@codspeed/core", () => ({
  ...jest.requireActual("@codspeed/core"),
  measurement: mockCore,
}));

beforeEach(() => {
  mockReset(mockCore);
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
      "packages/tinybench/tests/unit.test.ts::RegExp"
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
      "packages/tinybench/tests/unit.test.ts::RegExp"
    );
    expect(mockCore.stopInstrumentation).toHaveBeenCalledWith(
      "packages/tinybench/tests/unit.test.ts::RegExp2"
    );
  });
});
