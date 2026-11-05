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

/**
 * The samples (milliseconds) in nanoseconds, sorted. A typed array keeps them
 * off the V8 heap: a fast benchmark records tens of millions of samples.
 */
export function sortedSamplesNs(samples: ArrayLike<number>): Float64Array {
  const timesNs = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    timesNs[i] = msToNs(samples[i]);
  }
  // Typed arrays sort numerically by default.
  return timesNs.sort();
}

/** tinybench-style statistics of round samples, in milliseconds. */
export interface RoundsResult {
  totalTime: number;
  latency: {
    min: number;
    max: number;
    mean: number;
    sd: number;
    samples: ArrayLike<number>;
  };
}

/**
 * The result of nonempty round samples in milliseconds, e.g. the samples of
 * several forks of one benchmark. Throws if no samples were recorded.
 */
export function samplesToResult(samples: ArrayLike<number>): RoundsResult {
  const n = samples.length;
  if (n === 0) {
    throw new Error("[CodSpeed] Cannot compute statistics from empty samples");
  }
  let totalTime = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const ms = samples[i];
    totalTime += ms;
    if (ms < min) min = ms;
    if (ms > max) max = ms;
  }
  const mean = totalTime / n;
  let squaredDeviations = 0;
  for (let i = 0; i < n; i++) {
    squaredDeviations += (samples[i] - mean) ** 2;
  }
  const variance = n > 1 ? squaredDeviations / (n - 1) : 0;
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
