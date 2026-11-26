/**
 * Workloads emitting telemetry in different ways: nested spans with logs in
 * them, a log outside of any span, a log through the legacy logs API, or
 * nothing at all.
 */
import { logs, SeverityNumber, trace } from "@opentelemetry/api";
import { logs as legacyLogs } from "@opentelemetry/api-logs";

const tracer = trace.getTracer("with-telemetry");
const logger = logs.getLogger("with-telemetry");
const legacyLogger = legacyLogs.getLogger("with-telemetry-legacy");

function parse(input: string): number[] {
  return tracer.startActiveSpan("parse", (span) => {
    span.setAttribute("input_len", input.length);
    const values = input
      .split(",")
      .map(Number)
      .filter((value) => !Number.isNaN(value));
    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: "parsed values",
      attributes: { count: values.length },
    });
    span.end();
    return values;
  });
}

async function sum(values: number[]): Promise<number> {
  return tracer.startActiveSpan("sum", async (span) => {
    // Awaited, so that the span must follow the async context
    await Promise.resolve();
    const total = values.reduce((acc, value) => acc + value, 0);
    span.end();
    return total;
  });
}

/** Nested spans, with logs in them, across an `await`. */
export async function parseAndSum(): Promise<number> {
  return tracer.startActiveSpan("parse_and_sum", async (span) => {
    const values = parse("1,2,x,3");
    if (values.length < 4) {
      logger.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: "WARN",
        body: "skipped invalid fields",
        attributes: { skipped: 4 - values.length },
      });
    }
    const total = await sum(values);
    span.end();
    return total;
  });
}

/** A log outside of any span. */
export function logWithoutSpan(): number {
  const values = [1, 2, 3];
  logger.emit({
    severityNumber: SeverityNumber.INFO,
    severityText: "INFO",
    body: "summed without a span",
    attributes: { count: values.length },
  });
  return values.reduce((acc, value) => acc + value, 0);
}

/** A log through `@opentelemetry/api-logs`, which older instrumentations use. */
export function legacyLog(): number {
  const values = [1, 2, 3];
  legacyLogger.emit({
    severityText: "INFO",
    body: `summing ${values.length} values, logged with the legacy logs API`,
  });
  return values.reduce((acc, value) => acc + value, 0);
}

/** No telemetry at all. */
export function noTelemetry(): number {
  return [1, 2, 3].reduce((acc, value) => acc + value, 0);
}
