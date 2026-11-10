import { msToNs } from "@codspeed/core";
import { Bench, Fn, FnOptions, Task } from "tinybench";
import { getBenchOptions } from "./benchOptions";

const MIN_ROUND_TIME_MS = 1;
export const MIN_ROUND_TIME_NS = msToNs(MIN_ROUND_TIME_MS);

/** Round samples are batch averages, not individual-call latency distributions. */
export function batchTask(
  bench: Bench,
  fn: Fn,
  options: FnOptions | undefined,
  inheritedIterations?: number,
) {
  const state = { iterationsPerRound: inheritedIterations ?? 1 };
  if (
    options?.beforeEach ||
    options?.afterEach ||
    bench.concurrency === "task"
  ) {
    return { iterationsPerRound: 1, fn, options };
  }

  const { now } = getBenchOptions(bench);
  let active = false;
  let warmingUp = false;
  let calibrated = inheritedIterations !== undefined;
  let elapsed = 0;
  let calls = 0;

  function finishCalibration() {
    if (elapsed > 0) {
      state.iterationsPerRound = Math.max(
        1,
        Math.ceil((MIN_ROUND_TIME_MS * calls) / elapsed),
      );
    }
    calibrated = true;
  }
  function runBatch() {
    const result = fn();
    if (result instanceof Promise) {
      return (async () => {
        await result;
        for (let i = 1; i < state.iterationsPerRound; i++) await fn();
      })();
    }
    for (let i = 1; i < state.iterationsPerRound; i++) fn();
    return result;
  }

  function measure(): void | Promise<void> {
    const iterations = state.iterationsPerRound;
    const start = now();
    const result = runBatch();
    function record() {
      elapsed += now() - start;
      calls += iterations;
      if (!calibrated && elapsed >= MIN_ROUND_TIME_MS) finishCalibration();
    }
    if (result instanceof Promise) return result.then(record);
    record();
  }

  function prepare(mode?: "warmup" | "run"): void | Promise<void> {
    active = true;
    warmingUp = mode === "warmup";
    if (warmingUp || inheritedIterations !== undefined) return;
    if (calls > 0) {
      finishCalibration();
      return;
    }
    // With warmup disabled, calibrate after setup/beforeAll, outside timed rounds.
    // Wall-clock bounds also terminate calibration with a coarse/custom timer.
    const deadline = performance.now() + MIN_ROUND_TIME_MS;
    function calibrate(): void | Promise<void> {
      do {
        const result = measure();
        if (result instanceof Promise) {
          return result.then(() => {
            if (performance.now() < deadline) return calibrate();
            finishCalibration();
          });
        }
      } while (performance.now() < deadline);
      finishCalibration();
    }
    return calibrate();
  }

  return Object.assign(state, {
    fn: () => {
      // Tinybench may call the function at registration to detect promises.
      if (!active) return fn();
      if (warmingUp) return measure();
      return runBatch();
    },
    options: {
      ...options,
      beforeAll(this: Task, mode?: "warmup" | "run") {
        const result = options?.beforeAll?.call(this, mode);
        if (result instanceof Promise) return result.then(() => prepare(mode));
        return prepare(mode);
      },
    },
  });
}
