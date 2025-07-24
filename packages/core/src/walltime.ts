import fs from "fs";
import path from "path";

declare const __VERSION__: string;

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
  warmup_time_ns: number;
  min_round_time_ns: number;
  max_time_ns: number;
  max_rounds: number | null;
}

export interface Benchmark {
  name: string;
  uri: string;
  config: BenchmarkConfig;
  stats: BenchmarkStats;
}

export interface InstrumentInfo {
  type: string;
  clock_info: {
    implementation: string;
    monotonic: boolean;
    adjustable: boolean;
    resolution: number;
  };
}

export interface ResultData {
  creator: {
    name: string;
    version: string;
    pid: number;
  };
  instrument: InstrumentInfo;
  benchmarks: Benchmark[];
}

export function getProfileFolder(): string | null {
  return process.env.CODSPEED_PROFILE_FOLDER || null;
}

export function getCreatorMetadata() {
  return {
    creator: {
      name: "@codspeed/core",
      version: __VERSION__,
      pid: process.pid,
    },
  };
}

export function getWalltimeInstrumentInfo(): InstrumentInfo {
  return {
    type: "walltime",
    clock_info: {
      implementation: "perf_counter",
      monotonic: true,
      adjustable: false,
      resolution: 1e-9, // nanosecond resolution
    },
  };
}

export function writeWalltimeResults(
  benchmarks: Benchmark[],
  integrationName: string
) {
  const profileFolder = getProfileFolder();
  let resultPath: string;

  if (profileFolder) {
    const resultsDir = path.join(profileFolder, "results");
    fs.mkdirSync(resultsDir, { recursive: true });
    resultPath = path.join(resultsDir, `${process.pid}.json`);
  } else {
    // Fallback: write to .codspeed in current working directory
    const codspeedDir = path.join(process.cwd(), ".codspeed");
    fs.mkdirSync(codspeedDir, { recursive: true });
    resultPath = path.join(codspeedDir, `results_${Date.now()}.json`);
  }

  const data: ResultData = {
    creator: {
      name: integrationName,
      version: __VERSION__,
      pid: process.pid,
    },
    instrument: getWalltimeInstrumentInfo(),
    benchmarks: benchmarks,
  };

  fs.writeFileSync(resultPath, JSON.stringify(data, null, 2));
  console.log(`[CodSpeed] Results written to ${resultPath}`);
}

export function createDefaultBenchmarkConfig(): BenchmarkConfig {
  return {
    warmup_time_ns: 1_000_000_000, // 1 second default
    min_round_time_ns: 1_000_000, // 1ms default
    max_time_ns: 3_000_000_000, // 3 seconds default
    max_rounds: null,
  };
}
