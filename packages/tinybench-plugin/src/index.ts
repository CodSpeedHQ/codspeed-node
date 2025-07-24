import {
  getGitDir,
  getMeasurementMode,
  Measurement,
  MeasurementMode,
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
import { runWalltimeBench } from "./walltime";

tryIntrospect();

// Store URI mapping externally since fnOpts is private
export const taskUriMap = new WeakMap<Bench, Map<string, string>>();

export function withCodSpeed(bench: Bench): Bench {
  const measurementMode = getMeasurementMode();
  const rootCallingFile = getCallingFile();

  // Initialize URI mapping for this bench instance
  if (!taskUriMap.has(bench)) {
    taskUriMap.set(bench, new Map());
  }
  const uriMap = taskUriMap.get(bench)!;

  // Setup URI generation for tasks
  const rawAdd = bench.add;
  bench.add = (name, fn, opts?) => {
    const callingFile = getCallingFile();
    const uri = `${callingFile}::${name}`;
    // Store URI mapping
    uriMap.set(name, uri);
    return rawAdd.bind(bench)(name, fn, opts);
  };

  // Apply the appropriate measurement strategy based on mode and instrumentation
  if (
    measurementMode === MeasurementMode.Instrumentation &&
    Measurement.isInstrumented()
  ) {
    runInstrumentedBench(bench, rootCallingFile);
  } else if (measurementMode === MeasurementMode.WallTime) {
    runWalltimeBench(bench, rootCallingFile);
  } else {
    // Fallback: instrumentation requested but not available
    const rawRun = bench.run;
    bench.run = async () => {
      console.warn(
        `[CodSpeed] ${bench.tasks.length} benches detected but no instrumentation found, falling back to tinybench`
      );
      return await rawRun.bind(bench)();
    };
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
