import {
  getCallingFile,
  getCodspeedRunnerMode,
  getInstrumentMode,
  InstrumentHooks,
  mongoMeasurement,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
  tryIntrospect,
  wrapWithRootFrameSync,
} from "@codspeed/core";
import { Bench } from "tinybench";
import { setupCodspeedAnalysisBench } from "./analysis";
import { getOrCreateTaskDataMap } from "./taskData";
import { getOrCreateUriMap } from "./uri";
import { setupCodspeedWalltimeBench } from "./walltime";

tryIntrospect();

export function withCodSpeed(bench: Bench): Bench {
  const codspeedRunnerMode = getCodspeedRunnerMode();
  if (codspeedRunnerMode === "disabled") {
    return bench;
  }

  const rootCallingFile = getCallingFile(1);
  const instrumentMode = getInstrumentMode();

  // Compute and register URI for bench
  const uriMap = getOrCreateUriMap(bench);
  const taskDataMap = getOrCreateTaskDataMap(bench);

  const walltimeRunner =
    instrumentMode === "walltime"
      ? setupCodspeedWalltimeBench(bench, rootCallingFile)
      : null;
  if (instrumentMode === "analysis") {
    setupCodspeedAnalysisBench(bench, rootCallingFile);
  }

  const rawAdd = bench.add;
  // `getCallingFile` reads the stack, so this wrapper has to be the only frame
  // between the caller and `rawAdd`.
  bench.add = (name, fn, opts?) => {
    const callingFile = getCallingFile(1);
    let uri = callingFile;
    if (bench.name !== undefined) {
      uri += `::${bench.name}`;
    }
    uri += `::${name}`;
    uriMap.set(name, uri);
    taskDataMap.set(name, { fn, fnOpts: opts });
    // In walltime mode the task is driven by tinybench's own measured loop, so
    // the root frame must be baked into the function tinybench stores rather
    // than injected later (the function is an inaccessible private field on the
    // task from tinybench v6 onwards). The sync wrapper is transparent to the
    // function's return value, so it preserves tinybench's sync/async handling.
    const registeredFn =
      instrumentMode === "walltime" ? wrapWithRootFrameSync(fn) : fn;
    return rawAdd.bind(bench)(
      name,
      registeredFn,
      walltimeRunner?.withIterationMarkers(opts) ?? opts,
    );
  };

  return bench;
}

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
