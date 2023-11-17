import { Bench } from "tinybench";
import { baz } from "../../src/foobarbaz";

export function registerFoobarbazBenchmarks(bench: Bench) {
  bench
    .add("test sync baz 10", () => {
      baz(10);
    })
    .add("test sync baz 100", () => {
      baz(100);
    });
}
