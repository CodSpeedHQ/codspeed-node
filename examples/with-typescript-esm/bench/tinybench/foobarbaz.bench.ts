import { Bench } from "tinybench";
import { aBaz, baz } from "../../src/foobarbaz";

export function registerFoobarbazBenchmarks(bench: Bench) {
  bench
    .add("test sync baz 10", () => {
      baz(10);
    })
    .add("test sync baz 100", () => {
      baz(100);
    });

  bench
    .add("test async baz 10", async () => {
      await aBaz(10);
    })
    .add("test async baz 100", async () => {
      await aBaz(100);
    });
}
