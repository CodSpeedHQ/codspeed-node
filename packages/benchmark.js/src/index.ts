import Benchmark from "benchmark";

export function withCodSpeed(suite: Benchmark.Suite): Benchmark.Suite {
  suite.on("cycle", function (event: Benchmark.Event) {
    console.log(String(event.target));
  });
  return suite;
}
