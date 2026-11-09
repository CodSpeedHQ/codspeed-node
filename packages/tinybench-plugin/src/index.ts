import {
  getCallingFile,
  getCodspeedRunnerMode,
  getInstrumentMode,
  InstrumentHooks,
  mongoMeasurement,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
  tryIntrospect,
  walltimeIsolation,
  wrapWithRootFrameSync,
  type InstrumentMode,
  type IsolationMode,
  type WalltimeOptions,
} from "@codspeed/core";
import { Bench, type FnOptions } from "tinybench";
import { setupCodspeedAnalysisBench } from "./analysis";
import { getOrCreateTaskDataMap } from "./taskData";
import { getOrCreateUriMap } from "./uri";
import { runsTaskFn, setupCodspeedWalltimeBench } from "./walltime";

tryIntrospect();

export function withCodSpeed(
  bench: Bench,
  options: WalltimeOptions = {},
): Bench {
  const codspeedRunnerMode = getCodspeedRunnerMode();
  if (codspeedRunnerMode === "disabled") {
    return bench;
  }

  const rootCallingFile = getCallingFile(1);
  const instrumentMode = getInstrumentMode();
  const isolationMode = getIsolationMode(instrumentMode, options);

  // Compute and register URI for bench
  const uriMap = getOrCreateUriMap(bench);
  const taskDataMap = getOrCreateTaskDataMap(bench);
  const rawAdd = bench.add;
  bench.add = (name, fn, opts?) => {
    const callingFile = getCallingFile(1);
    let uri = callingFile;
    if (bench.name !== undefined) {
      uri += `::${bench.name}`;
    }
    uri += `::${name}`;
    uriMap.set(name, uri);
    taskDataMap.set(name, { fn, fnOpts: opts });
    const add = rawAdd.bind(bench);
    if (isolationMode === undefined) {
      return add(name, fn, opts);
    }
    // tinybench calls a function that isn't `async` once when it's added, to
    // tell whether it returns a promise. A process that doesn't run the task
    // registers a stub instead, so the user's function isn't called there.
    if (!runsTaskFn(isolationMode, uri)) {
      return add(name, notRunHere, opts);
    }
    // The task is driven by tinybench's own measured loop, so the root frame
    // must be baked into the function tinybench stores rather than injected
    // later (the function is an inaccessible private field on the task from
    // tinybench v6 onwards). An async wrapper would add an await to every
    // iteration, so the wrapper stays sync and tinybench is told that an async
    // function is async instead (honored from tinybench v6 onwards).
    const fnOpts: (FnOptions & { async?: boolean }) | undefined =
      fn.constructor.name === "AsyncFunction" ? { ...opts, async: true } : opts;
    return add(name, wrapWithRootFrameSync(fn), fnOpts);
  };

  if (instrumentMode === "analysis") {
    setupCodspeedAnalysisBench(bench, rootCallingFile);
  } else if (isolationMode !== undefined) {
    setupCodspeedWalltimeBench(bench, rootCallingFile, isolationMode);
  }

  return bench;
}

/** Only walltime runs are isolated. */
function getIsolationMode(
  instrumentMode: InstrumentMode,
  options: WalltimeOptions,
): IsolationMode | undefined {
  switch (instrumentMode) {
    case "walltime":
      return walltimeIsolation(options.forks);
    case "analysis":
    case "disabled":
      return undefined;
  }
}

/** Registered for tasks this process never runs; `async` so tinybench doesn't call it. */
async function notRunHere(): Promise<void> {}

/**
 * Dynamically setup the CodSpeed instruments.
 */
export async function setupInstruments(
  body: SetupInstrumentsRequestBody,
): Promise<SetupInstrumentsResponse> {
  if (!InstrumentHooks.isInstrumented()) {
    console.warn("[CodSpeed] No instrumentation found, using default mongoUrl");

    return { remoteAddr: body.mongoUrl };
  }

  return await mongoMeasurement.setupInstruments(body);
}
