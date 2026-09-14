import { execFileSync } from "child_process";

import type { BrowserCommandContext } from "vitest/node";

import {
  buildWalltimeStats,
  getInstrumentMode,
  InstrumentHooks,
  MARKER_TYPE_BENCHMARK_END,
  MARKER_TYPE_BENCHMARK_START,
  msToNs,
  writeWalltimeResults,
  type Benchmark,
} from "@codspeed/core";

import type {
  CodSpeedRunRoundRequest,
  CodSpeedRunRoundResponse,
} from "./browser/protocol";
import { ROUND_GLOBAL } from "./browser/protocol";
import { normalizePerfMap, type ServingViteServer } from "./perfMap";
import { buildBenchmarkUri } from "./uri";

declare const __VERSION__: string;

const INTEGRATION_NAME = "codspeed-browser";
const DEFAULT_WALLTIME_ROUNDS = 5;
const VGDB_TIMEOUT_MS = 120_000;
// Chromium takes tens of seconds to come up under the simulation instrument.
const LAUNCH_TIMEOUT_MS = 1_800_000;

// Sparkplug is left on deliberately: with the interpreter alone every JS call
// goes through a shared bytecode handler and the call graph degenerates, while
// the optimizing tiers inline the benchmarked functions out of it entirely.
const ANALYSIS_JS_FLAGS = [
  "--no-opt",
  "--no-maglev",
  "--hash-seed=1",
  "--random-seed=1",
  "--predictable",
  "--predictable-gc-schedule",
  "--no-concurrent-sweeping",
  "--interpreted-frames-native-stack",
  "--perf-basic-prof",
];

// No `--perf-prof`: the jitdump it writes names the same code ranges as the
// perf map, from the URL V8 compiled them from, and those names win over the
// map's.
const WALLTIME_JS_FLAGS = [
  "--perf-basic-prof",
  "--interpreted-frames-native-stack",
];

interface ChromiumProcessInfo {
  type: string;
  id: number;
}

interface BrowserCdpSession {
  send(
    method: "SystemInfo.getProcessInfo",
  ): Promise<{ processInfo: ChromiumProcessInfo[] }>;
}

interface RuntimeEvaluateResult {
  result: { value?: unknown };
  exceptionDetails?: { text: string; exception?: { description?: string } };
}

interface PageCdpSession {
  send(
    method: "Runtime.evaluate",
    params: {
      expression: string;
      awaitPromise: boolean;
      returnByValue: boolean;
    },
  ): Promise<RuntimeEvaluateResult>;
}

interface PlaywrightBrowser {
  version(): string;
  newBrowserCDPSession(): Promise<BrowserCdpSession>;
}

interface PlaywrightBrowserContext {
  browser(): PlaywrightBrowser | null;
  newCDPSession(page: PlaywrightPage): Promise<PageCdpSession>;
}

interface PlaywrightPage {
  context(): PlaywrightBrowserContext;
}

/** The page fixture the playwright provider adds to the command context. */
interface PlaywrightCommandContext {
  page: PlaywrightPage;
}

interface BrowserProcesses {
  /** Ancestor of every process the browser spawns, hence what a sample is attributed to. */
  browserPid: number;
  /** Process running the page's JavaScript, hence the one holding the profile. */
  rendererPid: number;
  version: string;
  integrationDeclared: boolean;
}

interface RunningBenchmark {
  uri: string;
  request: CodSpeedRunRoundRequest;
  instrumented: boolean;
  processes: BrowserProcesses;
  session: PageCdpSession;
  rounds: number;
  round: number;
  sampleTimesNs: bigint[];
}

const isAnalysis = getInstrumentMode() === "analysis";
const processesByBrowser = new WeakMap<PlaywrightBrowser, BrowserProcesses>();
const sessionsByPage = new WeakMap<PlaywrightPage, Promise<PageCdpSession>>();
const perfMaps = new Map<number, ServingViteServer | null>();
let running: RunningBenchmark | null = null;

function vgdb(pid: number, command: string[]): void {
  execFileSync("vgdb", [`--pid=${pid}`, ...command], {
    encoding: "utf8",
    timeout: VGDB_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** The dev server the page loaded its modules from, when the project exposes one. */
function resolveViteServer(
  ctx: BrowserCommandContext,
): ServingViteServer | null {
  const { project } = ctx as BrowserCommandContext & {
    project?: {
      vite?: ServingViteServer;
      browser?: { vite?: ServingViteServer };
    };
  };
  const server = project?.browser?.vite ?? project?.vite;
  return server?.config?.root === undefined ? null : server;
}

function resolvePage(ctx: BrowserCommandContext): PlaywrightPage {
  const { page } = ctx as BrowserCommandContext &
    Partial<PlaywrightCommandContext>;
  if (page === undefined) {
    throw new Error(
      "[CodSpeed] browser benchmarks require the playwright provider",
    );
  }
  return page;
}

async function resolveBrowserProcesses(
  page: PlaywrightPage,
): Promise<BrowserProcesses> {
  const browser = page.context().browser();
  if (browser === null) {
    throw new Error("[CodSpeed] the page is not attached to a browser");
  }

  const cached = processesByBrowser.get(browser);
  if (cached !== undefined) {
    return cached;
  }

  const cdp = await browser.newBrowserCDPSession();
  const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
  const browserProcess = processInfo.find(({ type }) => type === "browser");
  const rendererProcess = processInfo.find(({ type }) => type === "renderer");
  const browserPid = browserProcess?.id ?? rendererProcess?.id;
  const rendererPid = rendererProcess?.id ?? browserProcess?.id;
  if (browserPid === undefined || rendererPid === undefined) {
    throw new Error("[CodSpeed] the browser reported no process to profile");
  }

  const processes: BrowserProcesses = {
    browserPid,
    rendererPid,
    version: browser.version(),
    integrationDeclared: false,
  };
  processesByBrowser.set(browser, processes);
  return processes;
}

/**
 * The session rounds are driven through. Attaching sends CDP traffic of its own,
 * so it is done once, outside any measured region.
 */
function resolvePageSession(page: PlaywrightPage): Promise<PageCdpSession> {
  const cached = sessionsByPage.get(page);
  if (cached !== undefined) {
    return cached;
  }
  const session = page.context().newCDPSession(page);
  sessionsByPage.set(page, session);
  return session;
}

/**
 * Declare the integration to the instrument. Under the simulation instrument
 * this process is traced too, so a native client request would dump its own
 * profile: the browser's valgrind instance is driven out of band instead, with
 * the very request `setIntegration` issues.
 */
function declareIntegration(processes: BrowserProcesses): void {
  if (processes.integrationDeclared) {
    return;
  }
  processes.integrationDeclared = true;

  if (isAnalysis) {
    vgdb(processes.rendererPid, [
      "dump",
      `Metadata: ${INTEGRATION_NAME} ${__VERSION__}`,
    ]);
    return;
  }

  InstrumentHooks.setIntegration(INTEGRATION_NAME, __VERSION__);
  InstrumentHooks.setEnvironment("browser", "version", processes.version);
  InstrumentHooks.writeEnvironment(process.pid);
}

function resolveRounds(request: CodSpeedRunRoundRequest): number {
  if (isAnalysis) {
    return 1;
  }
  return request.rounds ?? DEFAULT_WALLTIME_ROUNDS;
}

async function openBenchmark(
  ctx: BrowserCommandContext,
  request: CodSpeedRunRoundRequest,
): Promise<RunningBenchmark> {
  if (ctx.testPath === undefined) {
    throw new Error("[CodSpeed] could not resolve the running benchmark file");
  }
  const uri = buildBenchmarkUri(ctx.testPath, request.fullTestName);
  const page = resolvePage(ctx);
  const processes = await resolveBrowserProcesses(page);
  const session = await resolvePageSession(page);
  const instrumented = InstrumentHooks.isInstrumented();

  collectPerfMap(processes.rendererPid, resolveViteServer(ctx));
  if (instrumented) {
    declareIntegration(processes);
    if (!isAnalysis) {
      InstrumentHooks.startBenchmark();
    }
  }

  return {
    uri,
    request,
    instrumented,
    processes,
    session,
    rounds: resolveRounds(request),
    round: 0,
    sampleTimesNs: [],
  };
}

function closeBenchmark(benchmark: RunningBenchmark): void {
  const { uri, processes, instrumented } = benchmark;

  if (instrumented && !isAnalysis) {
    InstrumentHooks.stopBenchmark();
    InstrumentHooks.setExecutedBenchmark(processes.browserPid, uri);

    const walltimeBenchmark: Benchmark = {
      name: benchmark.request.name,
      uri,
      config: {
        warmup_time_ns: null,
        min_round_time_ns: null,
        max_rounds: benchmark.rounds,
        max_time_ns: null,
      },
      stats: buildWalltimeStats(benchmark.sampleTimesNs),
    };
    writeWalltimeResults([walltimeBenchmark]);
  }

  console.log(`[CodSpeed] ${instrumented ? "Measured" : "Checked"} ${uri}`);
}

/**
 * Give up on a benchmark that never reached its last round, closing the sample
 * window it opened. Its rounds are dropped rather than reported partially.
 */
function abandonBenchmark(benchmark: RunningBenchmark): void {
  if (benchmark.instrumented && !isAnalysis) {
    InstrumentHooks.stopBenchmark();
  }
  console.warn(
    `[CodSpeed] Dropped ${benchmark.uri}: it did not run its rounds`,
  );
}

/**
 * Run one round in the page and return how long it took there. The call is
 * issued over the inspector protocol, which reaches the page without running
 * any script of ours in it.
 */
async function runRoundInPage(session: PageCdpSession): Promise<number> {
  const { result, exceptionDetails } = await session.send("Runtime.evaluate", {
    expression: `${ROUND_GLOBAL}()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails !== undefined) {
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text,
    );
  }
  return result.value as number;
}

async function measureRound(benchmark: RunningBenchmark): Promise<number> {
  const { processes, session } = benchmark;

  if (!benchmark.instrumented) {
    return await runRoundInPage(session);
  }

  if (isAnalysis) {
    vgdb(processes.rendererPid, ["zero"]);
    vgdb(processes.rendererPid, ["instrumentation", "on"]);
    try {
      return await runRoundInPage(session);
    } finally {
      vgdb(processes.rendererPid, ["instrumentation", "off"]);
      vgdb(processes.rendererPid, ["dump", benchmark.uri]);
    }
  }

  // Benchmark markers must land inside the sample window opened by
  // startBenchmark(), which the runner consumes in order.
  const startedAt = InstrumentHooks.currentTimestamp();
  try {
    return await runRoundInPage(session);
  } finally {
    const pid = processes.browserPid;
    InstrumentHooks.addMarker(pid, MARKER_TYPE_BENCHMARK_START, startedAt);
    InstrumentHooks.addMarker(
      pid,
      MARKER_TYPE_BENCHMARK_END,
      InstrumentHooks.currentTimestamp(),
    );
  }
}

async function codspeedRunRound(
  ctx: BrowserCommandContext,
  request: CodSpeedRunRoundRequest,
): Promise<CodSpeedRunRoundResponse> {
  if (
    running !== null &&
    (running.request.fullTestName !== request.fullTestName ||
      running.request.name !== request.name)
  ) {
    abandonBenchmark(running);
    running = null;
  }
  const benchmark = (running ??= await openBenchmark(ctx, request));

  const durationMs = await measureRound(benchmark);
  if (benchmark.instrumented && !isAnalysis) {
    benchmark.sampleTimesNs.push(BigInt(Math.round(msToNs(durationMs))));
  }

  benchmark.round += 1;
  if (benchmark.round >= benchmark.rounds) {
    running = null;
    closeBenchmark(benchmark);
  }
  return { rounds: benchmark.rounds };
}

/**
 * The map can only be read once the browser has stopped appending to it, so the
 * pids it was collected for are normalized when the run is over.
 */
function collectPerfMap(pid: number, server: ServingViteServer | null): void {
  if (perfMaps.size === 0) {
    process.on("exit", normalizeCollectedPerfMaps);
  }
  perfMaps.set(pid, server);
}

function normalizeCollectedPerfMaps(): void {
  for (const [pid, server] of perfMaps) {
    normalizePerfMap(pid, server);
  }
}

/**
 * The commands the page half calls to have a round measured. They are
 * registered only when CodSpeed drives the run, so their absence is what tells
 * the page it is not instrumented.
 */
export function codspeedBrowserCommands() {
  return { codspeedRunRound };
}

/**
 * Launch options for the browser the benchmarks run in: the V8 flags the
 * profiler needs to resolve the page's own frames, and the flags Chromium needs
 * to be traceable.
 */
export function codspeedLaunchOptions(): {
  timeout?: number;
  args?: string[];
} {
  const mode = getInstrumentMode();
  if (mode === "disabled") {
    return {};
  }

  return {
    timeout: LAUNCH_TIMEOUT_MS,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      // Under valgrind an HTTP navigation swaps the renderer process, which
      // the tracer cannot follow fast enough to keep the navigation alive.
      ...(mode === "analysis" ? ["--single-process"] : []),
      `--js-flags=${(mode === "analysis" ? ANALYSIS_JS_FLAGS : WALLTIME_JS_FLAGS).join(" ")}`,
    ],
  };
}
