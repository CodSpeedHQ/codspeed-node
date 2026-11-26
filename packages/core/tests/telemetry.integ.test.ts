import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace";
import { execFile } from "child_process";
import http from "http";
import { AddressInfo } from "net";
import path from "path";
import { promisify } from "util";
import { buildProviders } from "../src/telemetry";

// The addon only loads from the built package. The clock of the markers is
// monotonic, like this one.
jest.mock("../src/native_core", () => ({
  __esModule: true,
  default: {
    InstrumentHooks: { currentTimestamp: () => process.hrtime.bigint() },
  },
}));

const execFileAsync = promisify(execFile);

const corePath = path.resolve(__dirname, "..");

/** Emits a span with a child and a log in it, then flushes the export. */
const EMIT_SCRIPT = `
const core = require(${JSON.stringify(corePath)});
const { logs, trace } = require("@opentelemetry/api");
const tracer = trace.getTracer("test");
tracer.startActiveSpan("parent", async (parent) => {
  await tracer.startActiveSpan("child", async (child) => {
    await Promise.resolve();
    logs.getLogger("test").emit({ body: "in child" });
    child.end();
  });
  parent.end();
  await core.flushTelemetry();
  const loaded = Object.keys(require.cache).some((file) =>
    file.includes("@opentelemetry/sdk-trace"),
  );
  console.log(JSON.stringify({ loaded }));
});
`;

interface ReceivedRequest {
  url: string;
  contentType: string | undefined;
  body: Buffer;
}

async function startReceiver(): Promise<{
  endpoint: string;
  requests: ReceivedRequest[];
  close: () => Promise<void>;
}> {
  const requests: ReceivedRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      requests.push({
        url: req.url ?? "",
        contentType: req.headers["content-type"],
        body: Buffer.concat(chunks),
      });
      res.writeHead(200, { "content-type": "application/x-protobuf" });
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}/`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function runEmitScript(env: NodeJS.ProcessEnv): Promise<boolean> {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["-e", EMIT_SCRIPT],
    { cwd: corePath, env: { ...process.env, ...env } },
  );
  const lastLine = stdout.trim().split("\n").pop() ?? "";
  return (JSON.parse(lastLine) as { loaded: boolean }).loaded;
}

describe("telemetry", () => {
  it("exports spans and logs with their monotonic times", async () => {
    const receiver = await startReceiver();
    try {
      const loaded = await runEmitScript({
        CODSPEED_ENV: "runner",
        CODSPEED_RUNNER_MODE: "telemetry",
        CODSPEED_OTEL_ENDPOINT: receiver.endpoint,
      });
      expect(loaded).toBe(true);

      const traces = receiver.requests.filter((r) => r.url === "/v1/traces");
      const logs = receiver.requests.filter((r) => r.url === "/v1/logs");
      expect(traces).toHaveLength(1);
      expect(logs).toHaveLength(1);
      for (const request of [...traces, ...logs]) {
        expect(request.contentType).toBe("application/x-protobuf");
      }

      const traceBody = traces[0].body.toString("latin1");
      expect(traceBody).toContain("parent");
      expect(traceBody).toContain("child");
      expect(traceBody).toContain("codspeed.monotonic_start_ns");
      expect(traceBody).toContain("codspeed.monotonic_end_ns");

      const logBody = logs[0].body.toString("latin1");
      expect(logBody).toContain("in child");
      expect(logBody).toContain("codspeed.monotonic_time_ns");
    } finally {
      await receiver.close();
    }
  });

  it("doesn't load the SDK without an endpoint", async () => {
    const loaded = await runEmitScript({
      CODSPEED_ENV: "runner",
      CODSPEED_RUNNER_MODE: "simulation",
      CODSPEED_OTEL_ENDPOINT: "",
    });
    expect(loaded).toBe(false);
  });
});

describe("buildProviders", () => {
  beforeAll(() => {
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable(),
    );
  });

  afterAll(() => {
    context.disable();
  });

  it("links the spans and logs, with their monotonic times in order", async () => {
    const spanExporter = new InMemorySpanExporter();
    const logExporter = new InMemoryLogRecordExporter();
    const providers = buildProviders(spanExporter, logExporter);
    const tracer = providers.tracer.getTracer("test");
    const logger = providers.logger.getLogger("test");
    const now = () => Number(process.hrtime.bigint());

    const before = now();
    await tracer.startActiveSpan("parent", async (parent) => {
      await tracer.startActiveSpan("child", async (child) => {
        await Promise.resolve();
        logger.emit({ body: "in child" });
        child.end();
      });
      parent.end();
    });
    logger.emit({ body: "outside any span" });
    const after = now();
    await providers.tracer.forceFlush();
    await providers.logger.forceFlush();

    const spans = spanExporter.getFinishedSpans();
    const parent = spans.find((span) => span.name === "parent");
    const child = spans.find((span) => span.name === "child");
    if (parent === undefined || child === undefined) {
      throw new Error(`expected a parent and a child span, got ${spans}`);
    }
    expect(child.spanContext().traceId).toBe(parent.spanContext().traceId);
    expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);

    const startOf = (span: typeof parent) =>
      span.attributes["codspeed.monotonic_start_ns"] as number;
    const endOf = (span: typeof parent) =>
      span.attributes["codspeed.monotonic_end_ns"] as number;
    expect(before).toBeLessThanOrEqual(startOf(parent));
    expect(startOf(parent)).toBeLessThanOrEqual(startOf(child));
    expect(startOf(child)).toBeLessThanOrEqual(endOf(child));
    expect(endOf(child)).toBeLessThanOrEqual(endOf(parent));
    expect(endOf(parent)).toBeLessThanOrEqual(after);

    const [inChild, outside] = logExporter.getFinishedLogRecords();
    expect(inChild.body).toBe("in child");
    expect(inChild.spanContext?.traceId).toBe(child.spanContext().traceId);
    expect(inChild.spanContext?.spanId).toBe(child.spanContext().spanId);
    const logTime = inChild.attributes["codspeed.monotonic_time_ns"] as number;
    expect(startOf(child)).toBeLessThanOrEqual(logTime);
    expect(logTime).toBeLessThanOrEqual(endOf(child));

    expect(outside.body).toBe("outside any span");
    expect(outside.spanContext).toBeUndefined();
    const outsideTime = outside.attributes["codspeed.monotonic_time_ns"];
    expect(outsideTime).toBeGreaterThanOrEqual(endOf(parent));
  });
});
