import { withCodSpeed } from "@codspeed/benchmark.js-plugin";
import Benchmark from "benchmark";
import {
  legacyLog,
  logWithoutSpan,
  noTelemetry,
  parseAndSum,
} from "../src/workloads";

const suite = withCodSpeed(new Benchmark.Suite());

suite
  .add("parse_and_sum", {
    defer: true,
    fn: (deferred: Benchmark.Deferred) => {
      parseAndSum().then(() => deferred.resolve());
    },
  })
  .add("log_without_span", () => {
    logWithoutSpan();
  })
  .add("legacy_log", () => {
    legacyLog();
  })
  .add("no_telemetry", () => {
    noTelemetry();
  })
  .on("cycle", (event: Benchmark.Event) => {
    console.log(String(event.target));
  });

await suite.run({ async: true });
