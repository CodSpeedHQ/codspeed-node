import type { WithCodSpeedSuite } from "@codspeed/benchmark.js-plugin";
import { baz } from "../../src/foobarbaz";

export function registerFoobarbazBenchmarks(suite: WithCodSpeedSuite) {
  suite
    .add("test sync baz 10", () => {
      baz(10);
    })
    .add("test sync baz 100", () => {
      baz(100);
    });
}
