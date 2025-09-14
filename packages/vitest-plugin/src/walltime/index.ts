import { setupCore, writeWalltimeResults } from "@codspeed/core";
import { type RunnerTestSuite } from "vitest";
import { NodeBenchmarkRunner } from "vitest/runners";
import { patchRootSuiteWithFullFilePath } from "../common";
import { extractBenchmarkResults } from "./utils";

/**
 * WalltimeRunner uses Vitest's default benchmark execution
 * and extracts results from the suite after completion
 */
export class WalltimeRunner extends NodeBenchmarkRunner {
  private isTinybenchHookedWithCodspeed = false;
  private benchmarkUris = new Map<string, string>();

  async runSuite(suite: RunnerTestSuite): Promise<void> {
    patchRootSuiteWithFullFilePath(suite);

    setupCore();

    await super.runSuite(suite);

    const benchmarks = await extractBenchmarkResults(suite);

    if (benchmarks.length > 0) {
      writeWalltimeResults(benchmarks);
      console.log(
        `[CodSpeed] Done collecting walltime data for ${benchmarks.length} benches.`
      );
    } else {
      console.warn(
        `[CodSpeed] No benchmark results found after suite execution`
      );
    }
  }
}

export default WalltimeRunner;
