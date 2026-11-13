import { describe, test } from "vitest";
import {
  legacyLog,
  logWithoutSpan,
  noTelemetry,
  parseAndSum,
} from "./workloads";

describe("telemetry", () => {
  test("parse_and_sum", async ({ bench }) => {
    await bench("parse_and_sum", async () => {
      await parseAndSum();
    }).run();
  });

  test("log_without_span", async ({ bench }) => {
    await bench("log_without_span", () => {
      logWithoutSpan();
    }).run();
  });

  test("legacy_log", async ({ bench }) => {
    await bench("legacy_log", () => {
      legacyLog();
    }).run();
  });

  test("no_telemetry", async ({ bench }) => {
    await bench("no_telemetry", () => {
      noTelemetry();
    }).run();
  });
});
