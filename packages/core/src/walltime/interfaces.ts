export interface BenchmarkStats {
  min_ns: number;
  max_ns: number;
  mean_ns: number;
  stdev_ns: number;
  q1_ns: number;
  median_ns: number;
  q3_ns: number;
  rounds: number;
  total_time: number;
  iqr_outlier_rounds: number;
  stdev_outlier_rounds: number;
  iter_per_round: number;
  warmup_iters: number;
}

export interface BenchmarkConfig {
  warmup_time_ns: number | null;
  min_round_time_ns: number | null;
  max_time_ns?: number | null;
  max_rounds?: number | null;
}

export interface Benchmark {
  name: string;
  uri: string;
  config: BenchmarkConfig;
  stats: BenchmarkStats;
}

export interface InstrumentInfo {
  type: string;
}

export interface ResultData {
  creator: {
    name: string;
    version: string;
    pid: number;
  };
  instrument: { type: "walltime" };
  benchmarks: Benchmark[];
  metadata?: Record<string, unknown>;
}
