import { BenchmarkStats } from "./interfaces";
import { calculateQuantiles } from "./quantiles";
import { msToS } from "./utils";

/**
 * Build the statistics of a benchmark from the duration of each of its rounds,
 * for harnesses that time the rounds themselves instead of delegating to a
 * benchmark framework.
 */
export function buildWalltimeStats(sampleTimesNs: bigint[]): BenchmarkStats {
  const sortedTimesNs = sampleTimesNs
    .map((n) => Number(n))
    .sort((a, b) => a - b);

  const sum = sortedTimesNs.reduce((acc, t) => acc + t, 0);
  const meanNs = sum / sortedTimesNs.length;
  const variance =
    sortedTimesNs.reduce((acc, t) => acc + (t - meanNs) ** 2, 0) /
    sortedTimesNs.length;
  const stdevNs = Math.sqrt(variance);

  const { q1_ns, median_ns, q3_ns, iqr_outlier_rounds, stdev_outlier_rounds } =
    calculateQuantiles({
      meanNs,
      stdevNs,
      sortedTimesNs,
    });

  return {
    min_ns: sortedTimesNs[0],
    max_ns: sortedTimesNs[sortedTimesNs.length - 1],
    mean_ns: meanNs,
    stdev_ns: stdevNs,
    q1_ns,
    median_ns,
    q3_ns,
    rounds: sortedTimesNs.length,
    total_time: msToS(sum / 1e6),
    iqr_outlier_rounds,
    stdev_outlier_rounds,
    iter_per_round: 1,
    warmup_iters: 0,
  };
}
