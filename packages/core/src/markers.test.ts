import {
  composeIterationMarkerHooks,
  IterationMarkerRecorder,
} from "./markers";
import native_core from "./native_core";

let clock = 0n;
let clockStep = 1n;

// The real module loads the native addon and pulls in ESM-only dependencies.
jest.mock("./native_core", () => ({
  __esModule: true,
  default: {
    InstrumentHooks: {
      currentTimestamp: jest.fn(() => (clock += clockStep)),
      addMarker: jest.fn(() => 0),
      MARKER_TYPE_BENCHMARK_START: 2,
      MARKER_TYPE_BENCHMARK_END: 3,
    },
  },
}));

const hooks = native_core.InstrumentHooks;
const { MARKER_TYPE_BENCHMARK_START, MARKER_TYPE_BENCHMARK_END } = hooks;
const addMarker = hooks.addMarker as jest.MockedFunction<
  typeof hooks.addMarker
>;

/** The emitted marker stream, reduced to `[start, end]` ranges. */
function emittedRanges(): [bigint, bigint][] {
  const ranges: [bigint, bigint][] = [];
  for (let i = 0; i < addMarker.mock.calls.length; i += 2) {
    const [, startType, start] = addMarker.mock.calls[i];
    const [, endType, end] = addMarker.mock.calls[i + 1];
    expect(startType).toBe(MARKER_TYPE_BENCHMARK_START);
    expect(endType).toBe(MARKER_TYPE_BENCHMARK_END);
    ranges.push([start, end]);
  }
  return ranges;
}

/**
 * The clock advances by a fixed amount per iteration, so an emitted timestamp
 * identifies its iteration.
 */
const ITERATION_SPAN = 100n;

function runIterations(recorder: IterationMarkerRecorder, count: number): void {
  for (let i = 0; i < count; i++) {
    clock = BigInt(i) * ITERATION_SPAN;
    recorder.iterationStart();
    recorder.iterationEnd();
  }
}

beforeEach(() => {
  addMarker.mockClear();
  clock = 0n;
  clockStep = 1n;
});

describe("IterationMarkerRecorder", () => {
  it("emits one non-overlapping range per iteration", () => {
    const recorder = new IterationMarkerRecorder();
    recorder.start();
    runIterations(recorder, 5);
    recorder.flush();

    const ranges = emittedRanges();
    expect(ranges).toHaveLength(5);
    expect(addMarker.mock.calls.every(([pid]) => pid === process.pid)).toBe(
      true,
    );

    let previousEnd = 0n;
    for (const [start, end] of ranges) {
      expect(start).toBeGreaterThan(previousEnd);
      expect(end).toBeGreaterThan(start);
      previousEnd = end;
    }
  });

  it("keeps every iteration, emitting the buffer whenever it fills", () => {
    const recorder = new IterationMarkerRecorder(4);
    recorder.start();
    runIterations(recorder, 18);
    recorder.flush();

    const iterations = emittedRanges().map(([start]) =>
      Number(start / ITERATION_SPAN),
    );
    expect(iterations).toEqual([...Array(18).keys()]);
  });

  it("ignores iterations run outside the window", () => {
    const recorder = new IterationMarkerRecorder(2);
    runIterations(recorder, 8);
    recorder.start();
    runIterations(recorder, 3);
    recorder.flush();
    runIterations(recorder, 8);

    expect(emittedRanges()).toHaveLength(3);
  });

  it("emits nothing when no iteration was recorded", () => {
    const recorder = new IterationMarkerRecorder();
    recorder.start();
    recorder.flush();

    expect(emittedRanges()).toHaveLength(0);
  });

  it("drops ranges a stalled clock cannot separate", () => {
    const recorder = new IterationMarkerRecorder();
    clockStep = 0n;
    recorder.start();
    runIterations(recorder, 3);
    recorder.flush();

    expect(emittedRanges()).toHaveLength(0);
  });

  it("starts over on the next window", () => {
    const recorder = new IterationMarkerRecorder(4);
    recorder.start();
    runIterations(recorder, 16);
    recorder.flush();
    addMarker.mockClear();

    recorder.start();
    runIterations(recorder, 2);
    recorder.flush();
    expect(
      emittedRanges().map(([start]) => Number(start / ITERATION_SPAN)),
    ).toEqual([0, 1]);
  });
});

describe("composeIterationMarkerHooks", () => {
  it("keeps the user hooks outside the recorded range", () => {
    const recorder = new IterationMarkerRecorder();
    recorder.start();
    const calls: string[] = [];
    const { beforeEach: before, afterEach: after } =
      composeIterationMarkerHooks<() => void>(
        recorder,
        () => calls.push("before"),
        () => calls.push("after"),
      );

    before();
    const workStart = clock;
    after();
    recorder.flush();

    expect(calls).toEqual(["before", "after"]);
    const [[start, end]] = emittedRanges();
    expect(start).toBeLessThanOrEqual(workStart);
    expect(end).toBeGreaterThan(workStart);
  });

  it("waits for an async user hook before recording the range start", async () => {
    const recorder = new IterationMarkerRecorder();
    recorder.start();
    let released = false;
    const { beforeEach: before, afterEach: after } =
      composeIterationMarkerHooks<() => Promise<void> | void>(
        recorder,
        async () => {
          await Promise.resolve();
          released = true;
        },
      );

    const pending = before();
    expect(released).toBe(false);
    await pending;
    expect(released).toBe(true);

    after();
    recorder.flush();
    expect(emittedRanges()).toHaveLength(1);
  });

  it("stays synchronous for synchronous user hooks", () => {
    const recorder = new IterationMarkerRecorder();
    const { beforeEach: before, afterEach: after } =
      composeIterationMarkerHooks<() => void>(recorder);

    expect(before()).toBeUndefined();
    expect(after()).toBeUndefined();
  });

  it("forwards arguments and receiver to the user hooks", () => {
    const recorder = new IterationMarkerRecorder();
    const seen: unknown[][] = [];
    const receiver = { name: "task" };
    const observe = function (this: unknown, mode: string) {
      seen.push([this, mode]);
    };
    const { beforeEach: before, afterEach: after } =
      composeIterationMarkerHooks<(mode: string) => void>(
        recorder,
        observe,
        observe,
      );

    before.call(receiver, "run");
    after.call(receiver, "run");

    expect(seen).toEqual([
      [receiver, "run"],
      [receiver, "run"],
    ]);
  });
});
