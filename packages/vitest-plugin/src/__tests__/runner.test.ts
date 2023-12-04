import { fromPartial } from "@total-typescript/shoehorn";
import { describe, expect, it, vi } from "vitest";
import { getBenchFn } from "vitest/suite";
import CodSpeedRunner from "../runner";

const coreMocks = vi.hoisted(() => {
  return {
    Measurement: {
      startInstrumentation: vi.fn(),
      stopInstrumentation: vi.fn(),
    },
    setupCore: vi.fn(),
    teardownCore: vi.fn(),
    mongoMeasurement: {
      start: vi.fn(),
      stop: vi.fn(),
    },
  };
});

vi.mock("@codspeed/core", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@codspeed/core")>();
  return { ...mod, ...coreMocks };
});

console.log = vi.fn();

vi.mock("vitest/suite");
const mockedGetBenchFn = vi.mocked(getBenchFn);
describe("CodSpeedRunner", () => {
  it("should run the bench functions only twice", async () => {
    const benchFn = vi.fn();
    mockedGetBenchFn.mockReturnValue(benchFn);

    const runner = new CodSpeedRunner(fromPartial({}));
    await runner.runSuite(
      fromPartial({
        filepath: __filename,
        name: "test suite",
        tasks: [{ mode: "run", meta: { benchmark: true }, name: "test bench" }],
      })
    );

    // setup
    expect(coreMocks.setupCore).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/runner.test.ts"
    );

    // run
    expect(coreMocks.mongoMeasurement.start).toHaveBeenCalledWith(
      "packages/vitest-plugin/src/__tests__/runner.test.ts::test bench"
    );
    expect(coreMocks.Measurement.startInstrumentation).toHaveBeenCalledTimes(1);
    expect(benchFn).toHaveBeenCalledTimes(2);
    expect(coreMocks.Measurement.stopInstrumentation).toHaveBeenCalledTimes(1);
    expect(coreMocks.mongoMeasurement.stop).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] packages/vitest-plugin/src/__tests__/runner.test.ts::test bench done"
    );

    // teardown
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/runner.test.ts done"
    );
    expect(coreMocks.teardownCore).toHaveBeenCalledTimes(1);
  });

  it("should run nested suites", async () => {
    const benchFn = vi.fn();
    mockedGetBenchFn.mockReturnValue(benchFn);

    const runner = new CodSpeedRunner(fromPartial({}));
    await runner.runSuite(
      fromPartial({
        filepath: __filename,
        name: "test suite",
        tasks: [
          {
            type: "suite",
            name: "nested suite",
            mode: "run",
            tasks: [
              {
                mode: "run",
                meta: { benchmark: true },
                name: "test bench",
              },
            ],
          },
        ],
      })
    );

    // setup
    expect(coreMocks.setupCore).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/runner.test.ts"
    );

    // run
    expect(coreMocks.mongoMeasurement.start).toHaveBeenCalledWith(
      "packages/vitest-plugin/src/__tests__/runner.test.ts::nested suite::test bench"
    );
    expect(coreMocks.Measurement.startInstrumentation).toHaveBeenCalledTimes(1);
    expect(benchFn).toHaveBeenCalledTimes(2);
    expect(coreMocks.Measurement.stopInstrumentation).toHaveBeenCalledTimes(1);
    expect(coreMocks.mongoMeasurement.stop).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] packages/vitest-plugin/src/__tests__/runner.test.ts::nested suite::test bench done"
    );

    // teardown
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/runner.test.ts done"
    );
    expect(coreMocks.teardownCore).toHaveBeenCalledTimes(1);
  });
});
