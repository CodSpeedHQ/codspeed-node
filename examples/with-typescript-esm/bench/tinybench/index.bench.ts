import { withCodSpeed } from "@codspeed/tinybench-plugin";
import { Bench } from "tinybench";
import { registerFiboBenchmarks } from "./fibo.bench";
import { registerFoobarbazBenchmarks } from "./foobarbaz.bench";

export const bench = withCodSpeed(new Bench());

(async () => {
  registerFiboBenchmarks(bench);
  registerFoobarbazBenchmarks(bench);

  await bench.run();
  console.table(bench.table());
})();
