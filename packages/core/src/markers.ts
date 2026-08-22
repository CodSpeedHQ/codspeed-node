import native_core from "./native_core";

const hooks = native_core.InstrumentHooks;

/** 64Ki pairs, i.e. a 1 MiB timestamp buffer. */
const DEFAULT_MAX_PAIRS = 65536;

/**
 * Records BenchmarkStart/End timestamp pairs for individual benchmark
 * iterations and emits them as markers.
 *
 * Every iteration between `start()` and `flush()` is retained: the buffer is
 * emitted as-is once it fills, so the marker ranges cover the whole window.
 * Iterations run outside that bracket are ignored, since a marker emitted
 * outside the enclosing SampleStart/SampleEnd pair is discarded downstream.
 */
export class IterationMarkerRecorder {
  /** Flat `[start, end, start, end, …]` buffer, filled up to `writeIndex`. */
  private readonly timestamps: BigInt64Array;
  private readonly pid = process.pid;

  private recording = false;
  private writeIndex = 0;
  private pendingStart: bigint | null = null;

  constructor(maxPairs: number = DEFAULT_MAX_PAIRS) {
    if (maxPairs < 1) {
      throw new Error("maxPairs must be at least 1");
    }
    this.timestamps = new BigInt64Array(2 * maxPairs);
  }

  /** Start recording iterations, dropping anything left over from before. */
  public start(): void {
    this.recording = true;
    this.writeIndex = 0;
    this.pendingStart = null;
  }

  public iterationStart(): void {
    if (!this.recording) {
      return;
    }
    this.pendingStart = hooks.currentTimestamp();
  }

  public iterationEnd(): void {
    const start = this.pendingStart;
    if (start === null) {
      return;
    }
    this.pendingStart = null;

    // A zero-width range is rejected downstream, and carries no samples anyway.
    const end = hooks.currentTimestamp();
    if (end <= start) {
      return;
    }

    this.timestamps[this.writeIndex++] = start;
    this.timestamps[this.writeIndex++] = end;
    if (this.writeIndex === this.timestamps.length) {
      this.drain();
    }
  }

  /**
   * Emit the buffered pairs as markers and stop recording.
   *
   * Must be called while the sample window is still open.
   */
  public flush(): void {
    this.drain();
    this.recording = false;
    this.pendingStart = null;
  }

  private drain(): void {
    for (let i = 0; i < this.writeIndex; i += 2) {
      this.emitPair(this.timestamps[i], this.timestamps[i + 1]);
    }
    this.writeIndex = 0;
  }

  private emitPair(start: bigint, end: bigint): void {
    hooks.addMarker(this.pid, hooks.MARKER_TYPE_BENCHMARK_START, start);
    hooks.addMarker(this.pid, hooks.MARKER_TYPE_BENCHMARK_END, end);
  }
}

type UnknownHook = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Compose per-iteration hooks that record a timestamp pair around the work the
 * harness times, keeping the user's own hooks outside of the recorded range.
 *
 * The returned hooks stay synchronous when the user hooks are, which harnesses
 * may require. `Hook` is the harness' own hook type; the wrappers forward
 * whatever arguments and receiver they are called with.
 */
export function composeIterationMarkerHooks<
  Hook extends (...args: never[]) => unknown,
>(
  recorder: IterationMarkerRecorder,
  userBeforeEach?: Hook,
  userAfterEach?: Hook,
): { beforeEach: Hook; afterEach: Hook } {
  const before = userBeforeEach as UnknownHook | undefined;
  const after = userAfterEach as UnknownHook | undefined;

  const beforeEach: UnknownHook = function (...args) {
    const result = before?.apply(this, args);
    if (isPromiseLike(result)) {
      return result.then(() => {
        recorder.iterationStart();
      });
    }
    recorder.iterationStart();
    return result;
  };

  const afterEach: UnknownHook = function (...args) {
    recorder.iterationEnd();
    return after?.apply(this, args);
  };

  // The wrappers are agnostic to the receiver and return type `Hook` pins down,
  // so the cast is needed to hand them back as that type.
  return {
    beforeEach: beforeEach as unknown as Hook,
    afterEach: afterEach as unknown as Hook,
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}
