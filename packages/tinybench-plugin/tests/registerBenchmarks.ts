import type { Bench } from "tinybench";

export function registerBenchmarks(bench: Bench) {
  bench.add("RegExp", function () {
    /o/.test("Hello World!");
  });
}
