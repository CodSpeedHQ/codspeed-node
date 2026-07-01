import { fromPartial } from "@total-typescript/shoehorn";
import { describe, expect, it, vi, type RunnerTestSuite } from "vitest";
import { AnalysisRunner as CodSpeedRunner } from "../legacy/analysis";
import { getBenchFn, getBenchOptions } from "../legacy/compat";

// The legacy AnalysisRunner targets the Vitest 3/4 benchmark backend
// (`NodeBenchmarkRunner`, `vitest/suite`), which Vitest 5 removed. This whole
// file is excluded from the test run under v5+ (see vitest.config.ts); the v5
// path is covered separately.

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

vi.mock("../legacy/compat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../legacy/compat")>();
  return {
    ...actual,
    getBenchFn: vi.fn(),
    getBenchOptions: vi.fn(),
  };
});
const mockedGetBenchFn = vi.mocked(getBenchFn);
const mockedGetBenchOptions = vi.mocked(getBenchOptions);

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
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/instrumented.test.ts",
    );

    // run
    expect(coreMocks.mongoMeasurement.start).toHaveBeenCalledWith(
      "packages/vitest-plugin/src/__tests__/instrumented.test.ts::test bench",
    );
    expect(coreMocks.InstrumentHooks.startBenchmark).toHaveBeenCalledTimes(1);
    expect(benchFn).toHaveBeenCalledTimes(8);
    expect(coreMocks.InstrumentHooks.stopBenchmark).toHaveBeenCalledTimes(1);
    expect(coreMocks.mongoMeasurement.stop).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] packages/vitest-plugin/src/__tests__/instrumented.test.ts::test bench done",
    );

    // teardown
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/instrumented.test.ts done",
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
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/instrumented.test.ts",
    );

    // run
    expect(coreMocks.mongoMeasurement.start).toHaveBeenCalledWith(
      "packages/vitest-plugin/src/__tests__/instrumented.test.ts::nested suite::test bench",
    );
    expect(coreMocks.InstrumentHooks.startBenchmark).toHaveBeenCalledTimes(1);
    expect(benchFn).toHaveBeenCalledTimes(8);
    expect(coreMocks.InstrumentHooks.stopBenchmark).toHaveBeenCalledTimes(1);
    expect(coreMocks.mongoMeasurement.stop).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] packages/vitest-plugin/src/__tests__/instrumented.test.ts::nested suite::test bench done",
    );

    // teardown
    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] running suite packages/vitest-plugin/src/__tests__/instrumented.test.ts done",
    );
    expect(coreMocks.teardownCore).toHaveBeenCalledTimes(1);
  });
  it("should call the bench setup and teardown hooks around each cycle", async () => {
    const calls: string[] = [];
    mockedGetBenchFn.mockReturnValue(() => {
      calls.push("fn");
    });
    mockedGetBenchOptions.mockReturnValue({
      setup: (task, mode) => {
        calls.push(`setup:${mode}:${task.name}`);
      },
      teardown: (task, mode) => {
        calls.push(`teardown:${mode}:${task.name}`);
      },
    });
    coreMocks.InstrumentHooks.startBenchmark.mockImplementation(() => {
      calls.push("startBenchmark");
    });
    coreMocks.InstrumentHooks.stopBenchmark.mockImplementation(() => {
      calls.push("stopBenchmark");
    });

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

    const hookCalls = calls.filter((call) => call !== "fn");
    expect(hookCalls).toEqual([
      "setup:warmup:test bench",
      "teardown:warmup:test bench",
      "setup:run:test bench",
      "startBenchmark",
      "stopBenchmark",
      "teardown:run:test bench",
    ]);
  });
});
