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
 * The result of nonempty round samples in milliseconds, e.g. the samples of
 * several forks of one benchmark. Throws if no samples were recorded.
 */
export function samplesToResult(samples: number[]): RoundsResult {
  const n = samples.length;
  if (n === 0) {
    throw new Error("[CodSpeed] Cannot compute statistics from empty samples");
  }
  let totalTime = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const ms of samples) {
    totalTime += ms;
    if (ms < min) min = ms;
    if (ms > max) max = ms;
  }
  const mean = totalTime / n;
  const variance =
    n > 1
      ? samples.reduce((sum, ms) => sum + (ms - mean) ** 2, 0) / (n - 1)
      : 0;
  return {
    totalTime,
    latency: {
      min,
      max,
      mean,
      sd: Math.sqrt(variance),
      samples,
    },
  };
}
