import { bench, describe, type BenchOptions } from "vitest";

const busySleep = (ms: number): void => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // Busy wait
  }
};

const timingBenchOptions: BenchOptions = {
  iterations: 5,
  warmupIterations: 0,
};

describe("timing tests", () => {
  bench(
    "wait 1ms",
    async () => {
      busySleep(1);
    },
    timingBenchOptions
  );

  bench(
    "wait 500ms",
    async () => {
      busySleep(500);
    },
    timingBenchOptions
  );

  bench(
    "wait 1sec",
    async () => {
      busySleep(1_000);
    },
    timingBenchOptions
  );
});
