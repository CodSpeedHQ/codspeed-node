import { withCodSpeed } from "@codspeed/tinybench-plugin";
import { Bench } from "tinybench";
import {
  legacyLog,
  logWithoutSpan,
  noTelemetry,
  parseAndSum,
} from "../src/workloads";

const bench = withCodSpeed(new Bench());

bench
  .add("parse_and_sum", async () => {
    await parseAndSum();
  })
  .add("log_without_span", () => {
    logWithoutSpan();
  })
  .add("legacy_log", () => {
    legacyLog();
  })
  .add("no_telemetry", () => {
    noTelemetry();
  });

await bench.run();
console.table(bench.table());
