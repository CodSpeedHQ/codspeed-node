import {
  resolveWalltimeForks,
  runForks,
  samplesToResult,
  type Benchmark,
  type WalltimeOptions,
} from "@codspeed/core";
import type { Reporter, TestModule } from "vitest/node";
import {
  forkedBenchmarks,
  tinybenchTaskToBenchmark,
  writeAndLogWalltimeResults,
} from "../instrument";
import { withForkContext } from "./forkContext";

/**
 * Measures the benchmarks the workers queued (see `provider.ts`) in fresh
 * processes and reports their pooled rounds. Runs in the main process once the
 * run is over: every file has torn down, so resources its hooks held (ports,
 * databases, ...) are free for the forks. The global setup is still up (it
 * tears down on close), so the forks skip it and inherit what it provided.
 */
export function forkReporter(options: WalltimeOptions): Reporter {
  return {
    async onTestRunEnd(modules, _errors, reason) {
      if (reason === "interrupted") return;
      const benchmarks = await withForkContext(modules, () =>
        measureInForks(modules, options),
      );
      writeAndLogWalltimeResults(benchmarks);
    },
  };
}

async function measureInForks(
  modules: readonly TestModule[],
  options: WalltimeOptions,
): Promise<Benchmark[]> {
  const benchmarks: Benchmark[] = [];
  for (const module of modules) {
    for (const test of module.children.allTests()) {
      for (const queued of forkedBenchmarks(test.meta())) {
        const forks = resolveWalltimeForks(queued.forks ?? options.forks);
        const { samples } = await runForks(queued.uri, forks);
        const benchmark = tinybenchTaskToBenchmark(
          { name: queued.name, result: samplesToResult(samples) },
          queued.uri,
          queued.options,
        );
        if (benchmark) {
          benchmarks.push(benchmark);
        }
      }
    }
  }
  return benchmarks;
}
