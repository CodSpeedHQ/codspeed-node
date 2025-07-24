import {
  getCodspeedRunnerMode,
  getGitDir,
  Measurement,
  mongoMeasurement,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
  tryIntrospect,
} from "@codspeed/core";
import path from "path";
import { get as getStackTrace } from "stack-trace";
import { Bench } from "tinybench";
import { fileURLToPath } from "url";
import { runInstrumentedBench } from "./instrumented";
import { getOrCreateUriMap } from "./uri";
import { runWalltimeBench } from "./walltime";

tryIntrospect();

export function withCodSpeed(bench: Bench): Bench {
  const codspeedRunnerMode = getCodspeedRunnerMode();
  if (codspeedRunnerMode === "disabled") {
    return bench;
  }

  const rootCallingFile = getCallingFile();

  // Compute and register URI for bench
  const uriMap = getOrCreateUriMap(bench);
  const rawAdd = bench.add;
  bench.add = (name, fn, opts?) => {
    const callingFile = getCallingFile();
    const uri = `${callingFile}::${name}`;
    uriMap.set(name, uri);
    return rawAdd.bind(bench)(name, fn, opts);
  };

  if (codspeedRunnerMode === "instrumented") {
    runInstrumentedBench(bench, rootCallingFile);
  } else if (codspeedRunnerMode === "walltime") {
    runWalltimeBench(bench, rootCallingFile);
  }

  return bench;
}

function getCallingFile(): string {
  const stack = getStackTrace();
  let callingFile = stack[2].getFileName(); // [here, withCodSpeed, actual caller]
  const gitDir = getGitDir(callingFile);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  if (callingFile.startsWith("file://")) {
    callingFile = fileURLToPath(callingFile);
  }
  return path.relative(gitDir, callingFile);
}

/**
 * Dynamically setup the CodSpeed instruments.
 */
export async function setupInstruments(
  body: SetupInstrumentsRequestBody
): Promise<SetupInstrumentsResponse> {
  if (!Measurement.isInstrumented()) {
    console.warn("[CodSpeed] No instrumentation found, using default mongoUrl");

    return { remoteAddr: body.mongoUrl };
  }

  return await mongoMeasurement.setupInstruments(body);
}
