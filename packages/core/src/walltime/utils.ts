/**
 * Converts nanoseconds to milliseconds.
 * @param ns - the nanoseconds to convert
 * @returns the milliseconds
 */
export const nsToMs = (ns: number) => ns / 1e6;

/**
 * Converts milliseconds to nanoseconds.
 * @param ms - the milliseconds to convert
 * @returns the nanoseconds
 */
export const msToNs = (ms: number) => ms * 1e6;

/**
 * Converts milliseconds to seconds.
 * @param ms - the milliseconds to convert
 * @returns the seconds
 */
export const msToS = (ms: number) => ms / 1e3;

/** tinybench-style statistics of round samples, in milliseconds. */
export interface RoundsResult {
  totalTime: number;
  latency: {
    min: number;
    max: number;
    mean: number;
    sd: number;
    samples: number[];
  };
}

/**
 * The result of round samples in milliseconds, e.g. the samples of several
 * forks of one benchmark.
 */
export function samplesToResult(samples: number[]): RoundsResult {
  const n = samples.length;
  const totalTime = samples.reduce((sum, ms) => sum + ms, 0);
  const mean = totalTime / n;
  const variance =
    n > 1
      ? samples.reduce((sum, ms) => sum + (ms - mean) ** 2, 0) / (n - 1)
      : 0;
  return {
    totalTime,
    latency: {
      // Not Math.min(...samples): a time-based run overflows the stack.
      min: samples.reduce((a, b) => Math.min(a, b), Infinity),
      max: samples.reduce((a, b) => Math.max(a, b), -Infinity),
      mean,
      sd: Math.sqrt(variance),
      samples,
    },
  };
}
