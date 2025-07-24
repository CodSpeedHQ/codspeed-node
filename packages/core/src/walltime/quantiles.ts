export function calculateQuantiles({
  sortedTimesNs,
  stdevNs,
  meanNs,
}: {
  sortedTimesNs: number[];
  stdevNs: number;
  meanNs: number;
}): {
  q1_ns: number;
  median_ns: number;
  q3_ns: number;
  iqr_outlier_rounds: number;
  stdev_outlier_rounds: number;
} {
  const IQR_OUTLIER_FACTOR = 1.5;
  const STDEV_OUTLIER_FACTOR = 3;

  const n = sortedTimesNs.length;
  if (n === 0) {
    throw new Error("Cannot calculate quantiles for empty array");
  }
  if (n === 1) {
    return {
      q1_ns: sortedTimesNs[0],
      median_ns: sortedTimesNs[0],
      q3_ns: sortedTimesNs[0],
      iqr_outlier_rounds: 0,
      stdev_outlier_rounds: 0,
    };
  }

  // Use same quantile calculation as Python's statistics.quantiles(n=4)
  const q1Index = (n - 1) * 0.25;
  const q2Index = (n - 1) * 0.5;
  const q3Index = (n - 1) * 0.75;

  const q1_ns = interpolateQuantile(sortedTimesNs, q1Index);
  const median = interpolateQuantile(sortedTimesNs, q2Index);
  const q3_ns = interpolateQuantile(sortedTimesNs, q3Index);
  const iqr_ns = q3_ns - q1_ns;

  // Calculate outliers using same algorithm as pytest-codspeed
  const iqr_outlier_rounds = sortedTimesNs.filter(
    (t) =>
      t < q1_ns - IQR_OUTLIER_FACTOR * iqr_ns ||
      t > q3_ns + IQR_OUTLIER_FACTOR * iqr_ns
  ).length;

  const stdev_outlier_rounds = sortedTimesNs.filter(
    (t) =>
      t < meanNs - STDEV_OUTLIER_FACTOR * stdevNs ||
      t > meanNs + STDEV_OUTLIER_FACTOR * stdevNs
  ).length;

  return {
    q1_ns,
    median_ns: median,
    q3_ns,
    iqr_outlier_rounds,
    stdev_outlier_rounds,
  };
}

function interpolateQuantile(sortedArray: number[], index: number): number {
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);

  if (lowerIndex === upperIndex) {
    return sortedArray[lowerIndex];
  }

  const lowerValue = sortedArray[lowerIndex];
  const upperValue = sortedArray[upperIndex];
  const fraction = index - lowerIndex;

  return lowerValue + fraction * (upperValue - lowerValue);
}
