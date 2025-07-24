import fs from "fs";
import path from "path";
import { Benchmark, ResultData } from "./interfaces";

declare const __VERSION__: string;

export function getProfileFolder(): string | null {
  return process.env.CODSPEED_PROFILE_FOLDER || null;
}

export function writeWalltimeResults(benchmarks: Benchmark[]) {
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
      name: "codspeed-node",
      version: __VERSION__,
      pid: process.pid,
    },
    instrument: { type: "walltime" },
    benchmarks: benchmarks,
  };

  fs.writeFileSync(resultPath, JSON.stringify(data, null, 2));
  console.log(`[CodSpeed] Results written to ${resultPath}`);
}

export * from "./interfaces";
export * from "./quantiles";
export * from "./utils";
