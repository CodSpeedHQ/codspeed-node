import { execFile } from "child_process";
import http from "http";
import { AddressInfo } from "net";
import path from "path";
import { promisify } from "util";

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
