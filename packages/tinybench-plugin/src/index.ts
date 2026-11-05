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
  type WalltimeOptions,
} from "@codspeed/core";
import { Bench } from "tinybench";
import { setupCodspeedAnalysisBench } from "./analysis";
import { batchTask } from "./batching";
import { getOrCreateTaskDataMap } from "./taskData";
import { getOrCreateUriMap } from "./uri";
import { setupCodspeedWalltimeBench } from "./walltime";

tryIntrospect();

/**
 * Walltime rounds batch sequential invocations toward a 1 ms target, estimated
 * from warmup (or a short calibration when disabled). Forks share one batch size.
 * Per-invocation hooks and task concurrency stay unbatched. CodSpeed reports
 * per-invocation batch averages; total time is the sum of measured round durations.
 */
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
    if (instrumentMode !== "walltime") {
      taskDataMap.set(name, { fn, fnOpts: opts });
      return rawAdd.call(bench, name, fn, opts);
    }
    const isolation = walltimeIsolation(options.forks);
    let inheritedIterations: number | undefined;
    if (isolation.kind === "Fork") {
      inheritedIterations = isolation.iterationsPerRound;
    }
    const batching = batchTask(bench, fn, opts, inheritedIterations);
    taskDataMap.set(name, { fn, fnOpts: opts, batching });
    // Tinybench v6 stores the function in a private field, so wrap at registration.
    return rawAdd.call(
      bench,
      name,
      wrapWithRootFrameSync(batching.fn),
      batching.options,
    );
  };

  if (instrumentMode === "analysis") {
    setupCodspeedAnalysisBench(bench, rootCallingFile);
  } else if (instrumentMode === "walltime") {
    setupCodspeedWalltimeBench(bench, rootCallingFile, options);
  }

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
