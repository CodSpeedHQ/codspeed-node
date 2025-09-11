import type { Bench } from "tinybench";

const busySleep = (ms: number): void => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // Busy wait
  }
};

export function registerTimingBenchmarks(bench: Bench) {
  bench.add("wait 1ms", () => {
    busySleep(1);
  });

  bench.add("wait 500ms", () => {
    busySleep(500);
  });

  bench.add("wait 1sec", () => {
    busySleep(1000);
  });
}
