import type { Bench } from "tinybench";

export function registerOtherBenchmarks(bench: Bench) {
  bench.add("RegExp", function () {
    /o/.test("Hello World!");
  });
}
