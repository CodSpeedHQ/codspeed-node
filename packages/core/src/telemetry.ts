/**
 * Export of the OpenTelemetry spans and logs emitted by the benchmarks, over
 * OTLP/HTTP, to the receiver at `CODSPEED_OTEL_ENDPOINT`.
 *
 * Everything is a no-op unless the variable is set. The OpenTelemetry SDK is
 * only loaded then, so that the measured runs don't load it.
 *
 * Spans and log records keep the wall clock times of the SDK. They also carry
 * their times on the clock of the benchmark markers: spans as their
 * `codspeed.monotonic_start_ns` and `codspeed.monotonic_end_ns` attributes, log
 * records as their `codspeed.monotonic_time_ns` attribute.
 */

import type * as Api from "@opentelemetry/api";
import type * as ApiLogs from "@opentelemetry/api-logs";
import type * as ContextAsyncHooks from "@opentelemetry/context-async-hooks";
import type * as LogExporter from "@opentelemetry/exporter-logs-otlp-proto";
import type * as TraceExporter from "@opentelemetry/exporter-trace-otlp-proto";
import type * as Resources from "@opentelemetry/resources";
import type * as SdkLogs from "@opentelemetry/sdk-logs";
import type * as SdkTrace from "@opentelemetry/sdk-trace";
import { randomBytes } from "crypto";
import path from "path";
import native_core from "./native_core";
import { getCodspeedRunnerMode } from "./runnerMode";

/** Base URL of the OTLP/HTTP receiver, e.g. `http://localhost:4318`. */
const ENDPOINT_ENV = "CODSPEED_OTEL_ENDPOINT";

const MONOTONIC_START_ATTRIBUTE = "codspeed.monotonic_start_ns";
const MONOTONIC_END_ATTRIBUTE = "codspeed.monotonic_end_ns";
const MONOTONIC_TIME_ATTRIBUTE = "codspeed.monotonic_time_ns";

/**
 * Ended spans, and log records, queued for export, past which they are
 * dropped. Larger than the SDK default of 2048, which a benchmark emitting on
 * every call fills faster than the exporter drains it.
 */
const MAX_QUEUE_SIZE = 1 << 16;

/** Spans or log records sent per export request. */
const EXPORT_BATCH_SIZE = 4096;

interface Providers {
  tracer: SdkTrace.TracerProvider;
  logger: SdkLogs.LoggerProvider;
}

/** `undefined` until set up, `null` when nothing is exported. */
let providers: Providers | null | undefined;

/**
 * The time on the clock of the benchmark markers, in nanoseconds.
 *
 * OTLP has no unsigned integers: the clock fits in the integer range of a
 * double for the first 104 days of uptime.
 */
function monotonicNow(): number {
  return Number(native_core.InstrumentHooks.currentTimestamp());
}

/**
 * Registers global OpenTelemetry tracer and logger providers exporting to the
 * receiver at `CODSPEED_OTEL_ENDPOINT`, and a context manager propagating the
 * active span across async calls. Does nothing when the variable is unset, or
 * when called again.
 *
 * Providers already registered by the benchmarked code are kept: what they
 * emit isn't exported to CodSpeed.
 */
export function setupTelemetry(): void {
  if (providers !== undefined) {
    return;
  }
  providers = null;

  const endpoint = process.env[ENDPOINT_ENV]?.replace(/\/+$/, "");
  if (!endpoint) {
    return;
  }
  try {
    providers = registerProviders(endpoint);
  } catch (error) {
    console.warn(
      `[CodSpeed] failed to set up the OpenTelemetry export: ${error}`,
    );
    return;
  }
  // The event loop keeps running as long as the shutdown sends requests.
  process.once("beforeExit", () => {
    void shutdownTelemetry();
  });
}

/**
 * Exports the spans and log records ended so far. Call it before the process
 * may exit without emptying its event loop, e.g. in a worker its pool kills.
 */
export async function flushTelemetry(): Promise<void> {
  if (!providers) {
    return;
  }
  const results = await Promise.allSettled([
    providers.tracer.forceFlush(),
    providers.logger.forceFlush(),
  ]);
  warnOnFailures(results, "flush");
}

async function shutdownTelemetry(): Promise<void> {
  if (!providers) {
    return;
  }
  const { tracer, logger } = providers;
  providers = null;
  const results = await Promise.allSettled([
    tracer.shutdown(),
    logger.shutdown(),
  ]);
  warnOnFailures(results, "shut down");
}

function warnOnFailures(
  results: PromiseSettledResult<void>[],
  action: string,
): void {
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(
        `[CodSpeed] failed to ${action} the OpenTelemetry export: ${result.reason}`,
      );
    }
  }
}

/* eslint-disable @typescript-eslint/no-require-imports */
function registerProviders(endpoint: string): Providers {
  const api = require("@opentelemetry/api") as typeof Api;
  const apiLogs = require("@opentelemetry/api-logs") as typeof ApiLogs;
  const { AsyncLocalStorageContextManager } =
    require("@opentelemetry/context-async-hooks") as typeof ContextAsyncHooks;
  const { OTLPLogExporter } =
    require("@opentelemetry/exporter-logs-otlp-proto") as typeof LogExporter;
  const { OTLPTraceExporter } =
    require("@opentelemetry/exporter-trace-otlp-proto") as typeof TraceExporter;
  const { resourceFromAttributes } =
    require("@opentelemetry/resources") as typeof Resources;
  const { BatchLogRecordProcessor, LoggerProvider } =
    require("@opentelemetry/sdk-logs") as typeof SdkLogs;
  const { BatchSpanProcessor, TracerProvider } =
    require("@opentelemetry/sdk-trace") as typeof SdkTrace;
  /* eslint-enable @typescript-eslint/no-require-imports */

  const resource = resourceFromAttributes({ "service.name": serviceName() });
  const tracer = new TracerProvider({
    resource,
    idGenerator: new CryptoIdGenerator(),
    spanProcessors: [
      // Before the batch processor, which exports the span as it ends.
      new MonotonicTimestampSpanProcessor(),
      new BatchSpanProcessor({
        exporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
        maxQueueSize: MAX_QUEUE_SIZE,
        maxExportBatchSize: EXPORT_BATCH_SIZE,
      }),
    ],
  });
  const logger = new LoggerProvider({
    resource,
    processors: [
      new MonotonicTimeLogRecordProcessor(),
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: `${endpoint}/v1/logs` }),
        maxQueueSize: MAX_QUEUE_SIZE,
        maxExportBatchSize: EXPORT_BATCH_SIZE,
      }),
    ],
  });

  const contextManager = new AsyncLocalStorageContextManager().enable();
  if (!api.context.setGlobalContextManager(contextManager)) {
    contextManager.disable();
  }
  if (!api.trace.setGlobalTracerProvider(tracer)) {
    console.warn(
      "[CodSpeed] an OpenTelemetry tracer provider is already registered, its spans are not exported to CodSpeed",
    );
  }
  // The logs API moved into `@opentelemetry/api`, with a global provider of its
  // own: instrumentations still emitting through `@opentelemetry/api-logs` read
  // the provider registered there.
  if (!api.logs.setGlobalLoggerProvider(logger)) {
    console.warn(
      "[CodSpeed] an OpenTelemetry logger provider is already registered, its logs are not exported to CodSpeed",
    );
  }
  apiLogs.logs.setGlobalLoggerProvider(logger);

  return { tracer, logger };
}

/**
 * The SDK generates ids from `Math.random()`, which the benchmarks run with a
 * fixed seed: every benchmark process would generate the same trace ids.
 */
class CryptoIdGenerator implements SdkTrace.IdGenerator {
  generateTraceId(): string {
    return randomBytes(16).toString("hex");
  }

  generateSpanId(): string {
    return randomBytes(8).toString("hex");
  }
}

/**
 * Sets the times a span starts and ends at on the clock of the benchmark
 * markers, as the SDK takes its own times.
 */
class MonotonicTimestampSpanProcessor implements SdkTrace.SpanProcessor {
  onStart(span: SdkTrace.Span): void {
    span.setAttribute(MONOTONIC_START_ATTRIBUTE, monotonicNow());
  }

  /** Called before the span is ended, when its attributes can still be set. */
  onEnding(span: SdkTrace.Span): void {
    span.setAttribute(MONOTONIC_END_ATTRIBUTE, monotonicNow());
  }

  onEnd(): void {}

  async forceFlush(): Promise<void> {}

  async shutdown(): Promise<void> {}
}

/** Sets the time a log record is emitted at on the clock of the benchmark markers. */
class MonotonicTimeLogRecordProcessor implements SdkLogs.LogRecordProcessor {
  onEmit(logRecord: SdkLogs.ReadWriteLogRecord): void {
    logRecord.setAttribute(MONOTONIC_TIME_ATTRIBUTE, monotonicNow());
  }

  async forceFlush(): Promise<void> {}

  async shutdown(): Promise<void> {}
}

/**
 * `OTEL_SERVICE_NAME` when set, else the package running the benchmarks, else
 * the entry script.
 */
function serviceName(): string {
  const fromEnv = process.env.OTEL_SERVICE_NAME || process.env.npm_package_name;
  if (fromEnv) {
    return fromEnv;
  }
  const script = process.argv[1];
  return script
    ? path.basename(script, path.extname(script))
    : "codspeed-benchmark";
}

/**
 * In telemetry mode, wraps the benchmarked function to time each call on the
 * clock of the benchmark markers, sent as the bounds of a round of the current
 * benchmark. Telemetry emitted in the round is attributed to the benchmark.
 *
 * Call the returned function between `startBenchmark()` and `stopBenchmark()`:
 * the round markers must fall within the sample markers those send. Otherwise,
 * returns the function unchanged, keeping the measured code as it is.
 */
export function withRoundMarkers<T>(fn: () => T): () => T {
  if (getCodspeedRunnerMode() !== "telemetry") {
    return fn;
  }
  const hooks = native_core.InstrumentHooks;
  const addRound = (start: bigint) => {
    const end = hooks.currentTimestamp();
    hooks.addMarker(process.pid, hooks.MARKER_TYPE_BENCHMARK_START, start);
    hooks.addMarker(process.pid, hooks.MARKER_TYPE_BENCHMARK_END, end);
  };
  return () => {
    const start = hooks.currentTimestamp();
    let result: T;
    try {
      result = fn();
    } catch (error) {
      addRound(start);
      throw error;
    }
    if (result instanceof Promise) {
      return result.finally(() => addRound(start)) as T;
    }
    addRound(start);
    return result;
  };
}
