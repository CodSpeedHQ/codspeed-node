import { describe, test, type BenchOptions } from "vitest";

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
  test("wait 1ms", async ({ bench }) => {
    await bench("wait 1ms", async () => {
      busySleep(1);
    }).run(timingBenchOptions);
  });

  test("wait 500ms", async ({ bench }) => {
    await bench("wait 500ms", async () => {
      busySleep(500);
    }).run(timingBenchOptions);
  });

  test("wait 1sec", async ({ bench }) => {
    await bench("wait 1sec", async () => {
      busySleep(1_000);
    }).run(timingBenchOptions);
  });
});
