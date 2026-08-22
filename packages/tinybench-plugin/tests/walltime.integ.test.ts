import type * as CodspeedCore from "@codspeed/core";
import { InstrumentHooks } from "@codspeed/core";
import { Bench } from "tinybench";
import { beforeEach, describe, expect, it, MockInstance, vi } from "vitest";
import { withCodSpeed } from "../src";

const MARKER_TYPE_BENCHMARK_START = 2;
const MARKER_TYPE_BENCHMARK_END = 3;

const mockCore = vi.hoisted(() => ({
  mongoMeasurement: {
    start: vi.fn(),
    stop: vi.fn(),
    setupInstruments: vi.fn(),
  },
  setupCore: vi.fn(),
  teardownCore: vi.fn(),
  writeWalltimeResults: vi.fn(),
}));

vi.mock("@codspeed/core", async (importOriginal) => {
  const actual = await importOriginal<typeof CodspeedCore>();
  return {
    ...actual,
    ...mockCore,
  };
});

// The hooks are spied on rather than replaced: the marker recorder lives inside
// `@codspeed/core` and drives this very object.
let clock = 0n;
let addMarker: MockInstance<typeof InstrumentHooks.addMarker>;
let startBenchmark: MockInstance<typeof InstrumentHooks.startBenchmark>;
let stopBenchmark: MockInstance<typeof InstrumentHooks.stopBenchmark>;
let setExecutedBenchmark: MockInstance<
  typeof InstrumentHooks.setExecutedBenchmark
>;

/** The emitted marker stream, reduced to `[start, end]` ranges. */
function emittedRanges(): [bigint, bigint][] {
  const calls = addMarker.mock.calls;
  expect(calls.length % 2).toBe(0);

  const ranges: [bigint, bigint][] = [];
  for (let i = 0; i < calls.length; i += 2) {
    const [startPid, startType, start] = calls[i];
    const [endPid, endType, end] = calls[i + 1];
    expect([startPid, endPid]).toEqual([process.pid, process.pid]);
    expect([startType, endType]).toEqual([
      MARKER_TYPE_BENCHMARK_START,
      MARKER_TYPE_BENCHMARK_END,
    ]);
    ranges.push([start, end]);
  }
  return ranges;
}

beforeEach(() => {
  process.env.CODSPEED_ENV = "true";
  process.env.CODSPEED_RUNNER_MODE = "walltime";
  clock = 0n;
  // Every hook is stubbed: nothing here should reach the native addon.
  vi.spyOn(InstrumentHooks, "isInstrumented").mockReturnValue(true);
  vi.spyOn(InstrumentHooks, "currentTimestamp").mockImplementation(
    () => (clock += 1n),
  );
  addMarker = vi.spyOn(InstrumentHooks, "addMarker").mockReturnValue(0);
  startBenchmark = vi
    .spyOn(InstrumentHooks, "startBenchmark")
    .mockReturnValue(0);
  stopBenchmark = vi.spyOn(InstrumentHooks, "stopBenchmark").mockReturnValue(0);
  setExecutedBenchmark = vi
    .spyOn(InstrumentHooks, "setExecutedBenchmark")
    .mockReturnValue(0);
});

describe("walltime mode markers", () => {
  it("emits one range per measured iteration", async () => {
    const bench = withCodSpeed(
      new Bench({ iterations: 6, time: 0, warmup: false }),
    ).add("RegExp", () => {
      /o/.test("Hello World!");
    });
    await bench.run();

    const iterations = bench.tasks[0].result.latency.samples.length;
    expect(iterations).toBeGreaterThanOrEqual(6);
    expect(emittedRanges()).toHaveLength(iterations);
  });

  it("attributes the benchmark to the file that registered it", async () => {
    const bench = withCodSpeed(
      new Bench({ iterations: 2, time: 0, warmup: false }),
    ).add("RegExp", () => {
      /o/.test("Hello World!");
    });
    await bench.run();

    expect(setExecutedBenchmark).toHaveBeenCalledWith(
      process.pid,
      "packages/tinybench-plugin/tests/walltime.integ.test.ts::RegExp",
    );
  });

  it("nests the ranges inside the sample window", async () => {
    const bench = withCodSpeed(
      new Bench({ iterations: 4, time: 0, warmup: false }),
    ).add("RegExp", () => {
      /o/.test("Hello World!");
    });
    await bench.run();

    // The window is opened once and closed once, with every marker in between:
    // a range emitted after stopBenchmark() would fall outside the sample.
    expect(startBenchmark).toHaveBeenCalledTimes(1);
    expect(stopBenchmark).toHaveBeenCalledTimes(1);
    const [windowOpen] = startBenchmark.mock.invocationCallOrder;
    const [windowClose] = stopBenchmark.mock.invocationCallOrder;
    for (const order of addMarker.mock.invocationCallOrder) {
      expect(order).toBeGreaterThan(windowOpen);
      expect(order).toBeLessThan(windowClose);
    }

    let previousEnd = 0n;
    for (const [start, end] of emittedRanges()) {
      expect(start).toBeGreaterThan(previousEnd);
      expect(end).toBeGreaterThan(start);
      previousEnd = end;
    }
  });

  it("records the run of each task separately", async () => {
    const bench = withCodSpeed(
      new Bench({ iterations: 3, time: 0, warmup: false }),
    )
      .add("RegExp", () => {
        /o/.test("Hello World!");
      })
      .add("RegExp2", () => {
        /o/.test("Hello World!");
      });
    await bench.run();

    const iterations = bench.tasks.reduce(
      (total, task) => total + task.result.latency.samples.length,
      0,
    );
    expect(startBenchmark).toHaveBeenCalledTimes(2);
    expect(emittedRanges()).toHaveLength(iterations);
  });

  it("keeps the user's per-iteration hooks outside the ranges", async () => {
    const calls: string[] = [];
    const bench = withCodSpeed(
      new Bench({ iterations: 2, time: 0, warmup: false }),
    ).add(
      "RegExp",
      () => {
        calls.push("fn");
      },
      {
        beforeEach: () => calls.push("beforeEach"),
        afterEach: () => calls.push("afterEach"),
      },
    );
    await bench.run();

    // tinybench probes the function once to detect whether it is async, so the
    // first measured iteration starts at the first `beforeEach`.
    const firstIteration = calls.indexOf("beforeEach");
    expect(calls.slice(firstIteration, firstIteration + 3)).toEqual([
      "beforeEach",
      "fn",
      "afterEach",
    ]);
    expect(calls.filter((call) => call === "beforeEach")).toHaveLength(
      bench.tasks[0].result.latency.samples.length,
    );
    expect(emittedRanges().length).toBeGreaterThan(0);
  });

  it("excludes the warmup from the ranges", async () => {
    const bench = withCodSpeed(
      new Bench({ iterations: 2, time: 0, warmup: true, warmupIterations: 5 }),
    ).add("RegExp", () => {
      /o/.test("Hello World!");
    });
    await bench.run();

    expect(emittedRanges()).toHaveLength(
      bench.tasks[0].result.latency.samples.length,
    );
  });
});
