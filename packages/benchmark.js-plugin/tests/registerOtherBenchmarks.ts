import type { WithCodSpeedSuite } from "..";

export function registerOtherBenchmarks(suite: WithCodSpeedSuite) {
  suite.add(
    "RegExp",
    function () {
      /o/.test("Hello World!");
    },
    { maxTime: 0.1 }
  );
}
