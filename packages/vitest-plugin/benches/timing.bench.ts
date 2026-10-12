import { describe, test, type BenchCompareOptions } from "vitest";

const busySleep = (ms: number): void => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // Busy wait
  }
};

const timingBenchOptions: BenchCompareOptions = {
  iterations: 5,
  warmupIterations: 0,
};

describe("timing tests", () => {
  test("busy sleep", async ({ bench }) => {
    await bench.compare(
      bench("wait 1ms", async () => {
        busySleep(1);
      }),
      bench("wait 500ms", async () => {
        busySleep(500);
      }),
      bench("wait 1sec", async () => {
        busySleep(1_000);
      }),
      timingBenchOptions,
    );
  });
});
