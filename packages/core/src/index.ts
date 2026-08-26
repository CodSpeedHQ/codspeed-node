import { checkV8Flags } from "./introspection";
import { MongoMeasurement } from "./mongoMeasurement";
import native_core from "./native_core";
import { getCodspeedRunnerMode } from "./runnerMode";

declare const __VERSION__: string;

const linuxPerf = new native_core.LinuxPerf();

export const isBound = native_core.isBound;

export const mongoMeasurement = new MongoMeasurement();

export const setupCore = () => {
  if (!native_core.isBound) {
    throw new Error(
      "Native core module is not bound, CodSpeed integration will not work properly",
    );
  }

  native_core.InstrumentHooks.setIntegration("codspeed-node", __VERSION__);
  // In walltime, we use node's native profiling options rather than our own, cf `getV8Flags`
  if (getCodspeedRunnerMode() !== "walltime") {
    linuxPerf.start();
  }
  checkV8Flags();

  // Collect Node.js runtime environment to detect changes that could
  // cause performance differences across runs
  const hooks = native_core.InstrumentHooks;
  hooks.setEnvironment("nodejs", "version", process.versions.node);
  hooks.setEnvironment("nodejs", "v8", process.versions.v8);
  hooks.writeEnvironment(process.pid);
};

export const teardownCore = () => {
  if (getCodspeedRunnerMode() !== "walltime") {
    linuxPerf.stop();
  }
};

export type {
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
} from "./generated/openapi";
export { getV8Flags, tryIntrospect } from "./introspection";
export { optimizeFunction, optimizeFunctionSync } from "./optimization";
export { wrapWithRootFrame, wrapWithRootFrameSync } from "./rootFrame";
export * from "./utils";
export * from "./walltime";
export type { InstrumentMode } from "./runnerMode";
export { getCodspeedRunnerMode, getInstrumentMode } from "./runnerMode";
export const InstrumentHooks = native_core.InstrumentHooks;

// Marker type constants, sourced from the native addon (which reads them from
// core.h) so they never drift from the native definitions.
export const MARKER_TYPE_SAMPLE_START =
  native_core.InstrumentHooks.MARKER_TYPE_SAMPLE_START;
export const MARKER_TYPE_SAMPLE_END =
  native_core.InstrumentHooks.MARKER_TYPE_SAMPLE_END;
export const MARKER_TYPE_BENCHMARK_START =
  native_core.InstrumentHooks.MARKER_TYPE_BENCHMARK_START;
export const MARKER_TYPE_BENCHMARK_END =
  native_core.InstrumentHooks.MARKER_TYPE_BENCHMARK_END;
