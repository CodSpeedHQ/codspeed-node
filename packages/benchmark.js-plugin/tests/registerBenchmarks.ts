import type { WithCodSpeedSuite } from "..";

export function registerBenchmarks(suite: WithCodSpeedSuite) {
  suite.add(
    "RegExp",
    function () {
      /o/.test("Hello World!");
    },
    { maxTime: 0.1 }
  );
}
