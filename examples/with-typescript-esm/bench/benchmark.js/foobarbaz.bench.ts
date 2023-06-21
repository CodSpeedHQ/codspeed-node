import type { WithCodSpeedSuite } from "@codspeed/benchmark.js-plugin";
import { aBaz, baz } from "../../src/foobarbaz";

export function registerFoobarbazBenchmarks(suite: WithCodSpeedSuite) {
  suite
    .add("test sync baz 10", () => {
      baz(10);
    })
    .add("test sync baz 100", () => {
      baz(100);
    });

  suite
    .add("test async baz 10", async () => {
      await aBaz(10);
    })
    .add("test async baz 100", async () => {
      await aBaz(100);
    });
}
