import { fromPartial } from "@total-typescript/shoehorn";
import { describe, expect, it, vi, type RunnerTestSuite } from "vitest";
import { getBenchFn } from "vitest/suite";
import { AnalysisRunner as CodSpeedRunner } from "../analysis";

const coreMocks = vi.hoisted(() => {
  return {
    InstrumentHooks: {
      startBenchmark: vi.fn(),
      stopBenchmark: vi.fn(),
      setExecutedBenchmark: vi.fn(),
    },
    setupCore: vi.fn(),
    teardownCore: vi.fn(),
    mongoMeasurement: {
      start: vi.fn(),
      stop: vi.fn(),
    },
  };
});

global.eval = vi.fn();

vi.mock("@codspeed/core", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@codspeed/core")>();
  return { ...mod, ...coreMocks };
});

console.log = vi.fn();

vi.mock("vitest/suite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vitest/suite")>();
  return {
    ...actual,
    getBenchFn: vi.fn(),
  };
});
const mockedGetBenchFn = vi.mocked(getBenchFn);

describe("CodSpeedRunner", () => {
  it("should run the bench function", async () => {
    const benchFn = vi.fn();
    mockedGetBenchFn.mockReturnValue(benchFn);

    const runner = new CodSpeedRunner(fromPartial({}));
    const suite = fromPartial<RunnerTestSuite>({
      file: { filepath: __filename },
      name: "test suite",
      tasks: [
        {
          type: "test",
          mode: "run",
          meta: { benchmark: true },
          name: "test bench",
        },
      ],
    });
    await runner.runSuite(suite);

    // setup
    expect(coreMocks.setupCore).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/instrumented.test.ts"
    );

    // run
    expect(coreMocks.mongoMeasurement.start).toHaveBeenCalledWith(
      "packages/vitest-plugin/src/__tests__/instrumented.test.ts::test bench"
    );
    expect(coreMocks.InstrumentHooks.startBenchmark).toHaveBeenCalledTimes(1);
    expect(benchFn).toHaveBeenCalledTimes(8);
    expect(coreMocks.InstrumentHooks.stopBenchmark).toHaveBeenCalledTimes(1);
    expect(coreMocks.mongoMeasurement.stop).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] packages/vitest-plugin/src/__tests__/instrumented.test.ts::test bench done"
    );

    // teardown
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/instrumented.test.ts done"
    );
    expect(coreMocks.teardownCore).toHaveBeenCalledTimes(1);
  });

  it("should run nested suites", async () => {
    const benchFn = vi.fn();
    mockedGetBenchFn.mockReturnValue(benchFn);

    const runner = new CodSpeedRunner(fromPartial({}));
    const rootSuite = fromPartial<RunnerTestSuite>({
      file: { filepath: __filename },
      name: "test suite",
      tasks: [
        {
          type: "suite",
          name: "nested suite",
          mode: "run",
          tasks: [
            {
              type: "test",
              mode: "run",
              meta: { benchmark: true },
              name: "test bench",
            },
          ],
        },
      ],
    });

    await runner.runSuite(rootSuite);

    // setup
    expect(coreMocks.setupCore).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/instrumented.test.ts"
    );

    // run
    expect(coreMocks.mongoMeasurement.start).toHaveBeenCalledWith(
      "packages/vitest-plugin/src/__tests__/instrumented.test.ts::nested suite::test bench"
    );
    expect(coreMocks.InstrumentHooks.startBenchmark).toHaveBeenCalledTimes(1);
    expect(benchFn).toHaveBeenCalledTimes(8);
    expect(coreMocks.InstrumentHooks.stopBenchmark).toHaveBeenCalledTimes(1);
    expect(coreMocks.mongoMeasurement.stop).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] packages/vitest-plugin/src/__tests__/instrumented.test.ts::nested suite::test bench done"
    );

    // teardown
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/instrumented.test.ts done"
    );
    expect(coreMocks.teardownCore).toHaveBeenCalledTimes(1);
  });
});
