import {
  getCallingFile,
  getCodspeedRunnerMode,
  getInstrumentMode,
  InstrumentHooks,
  mongoMeasurement,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
  tryIntrospect,
} from "@codspeed/core";
import { Bench } from "tinybench";
import { setupCodspeedAnalysisBench } from "./analysis";
import { getOrCreateUriMap } from "./uri";
import { setupCodspeedWalltimeBench } from "./walltime";

tryIntrospect();

export function withCodSpeed(bench: Bench): Bench {
  const codspeedRunnerMode = getCodspeedRunnerMode();
  if (codspeedRunnerMode === "disabled") {
    return bench;
  }

  const rootCallingFile = getCallingFile(1);

  // Compute and register URI for bench
  const uriMap = getOrCreateUriMap(bench);
  const rawAdd = bench.add;
  bench.add = (name, fn, opts?) => {
    const callingFile = getCallingFile(1);
    let uri = callingFile;
    if (bench.name !== undefined) {
      uri += `::${bench.name}`;
    }
    uri += `::${name}`;
    uriMap.set(name, uri);
    return rawAdd.bind(bench)(name, fn, opts);
  };

  const instrumentMode = getInstrumentMode();
  if (instrumentMode === "analysis") {
    setupCodspeedAnalysisBench(bench, rootCallingFile);
  } else if (instrumentMode === "walltime") {
    setupCodspeedWalltimeBench(bench, rootCallingFile);
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
