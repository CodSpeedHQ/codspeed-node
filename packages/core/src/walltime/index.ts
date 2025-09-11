import fs from "fs";
import path from "path";
import { Benchmark, ResultData } from "./interfaces";

declare const __VERSION__: string;

export function getProfileFolder(): string | null {
  return process.env.CODSPEED_PROFILE_FOLDER || null;
}

export function writeWalltimeResults(
  benchmarks: Benchmark[],
  asyncWarning = false
): void {
  const profileFolder = getProfileFolder();

  const resultDir = (() => {
    if (profileFolder) {
      return path.join(profileFolder, "results");
    } else {
      // Fallback: write to .codspeed in current working directory
      return path.join(process.cwd(), ".codspeed");
    }
  })();
  fs.mkdirSync(resultDir, { recursive: true });
  const resultPath = path.join(resultDir, `${process.pid}.json`);

  // Check if file already exists and merge benchmarks
  let existingBenchmarks: Benchmark[] = [];
  if (fs.existsSync(resultPath)) {
    try {
      const existingData = JSON.parse(
        fs.readFileSync(resultPath, "utf-8")
      ) as ResultData;
      existingBenchmarks = existingData.benchmarks || [];
    } catch (error) {
      console.warn(`[CodSpeed] Failed to read existing results file: ${error}`);
    }
  }

  const data: ResultData = {
    creator: {
      name: "codspeed-node",
      version: __VERSION__,
      pid: process.pid,
    },
    instrument: { type: "walltime" },
    benchmarks: [...existingBenchmarks, ...benchmarks],
    metadata: asyncWarning
      ? {
          async_warning: "Profiling is inaccurate due to async operations",
        }
      : undefined,
  };

  fs.writeFileSync(resultPath, JSON.stringify(data, null, 2));
  console.log(
    `[CodSpeed] Results written to ${resultPath} (${data.benchmarks.length} total benchmarks)`
  );
}

export * from "./interfaces";
export * from "./quantiles";
export * from "./utils";
