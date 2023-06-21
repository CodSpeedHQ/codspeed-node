import { withCodSpeed } from "@codspeed/benchmark.js-plugin";
import Benchmark from "benchmark";
import { registerFiboBenchmarks } from "./fibo.bench";
import { registerFoobarbazBenchmarks } from "./foobarbaz.bench";

export const suite = withCodSpeed(new Benchmark.Suite());

(async () => {
  registerFiboBenchmarks(suite);
  registerFoobarbazBenchmarks(suite);

  suite.on("cycle", function (event: Benchmark.Event) {
    console.log(String(event.target));
  });

  await suite.run({ async: true });
})();
