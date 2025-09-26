import { checkV8Flags } from "./introspection";
import { MongoMeasurement } from "./mongoMeasurement";
import native_core from "./native_core";

declare const __VERSION__: string;

const linuxPerf = new native_core.LinuxPerf();

export const isBound = native_core.isBound;

export const mongoMeasurement = new MongoMeasurement();

type CodSpeedRunnerMode = "disabled" | "instrumented" | "walltime";

export function getCodspeedRunnerMode(): CodSpeedRunnerMode {
  const isCodSpeedEnabled = process.env.CODSPEED_ENV !== undefined;
  if (!isCodSpeedEnabled) {
    return "disabled";
  }

  // If CODSPEED_ENV is set, check CODSPEED_RUNNER_MODE
  const codspeedRunnerMode = process.env.CODSPEED_RUNNER_MODE;
  if (codspeedRunnerMode === "instrumentation") {
    return "instrumented";
  } else if (codspeedRunnerMode === "walltime") {
    return "walltime";
  }

  console.warn(
    `Unknown codspeed runner mode: ${codspeedRunnerMode}, defaulting to disabled`
  );
  return "disabled";
}

export const setupCore = () => {
  if (!native_core.isBound) {
    throw new Error(
      "Native core module is not bound, CodSpeed integration will not work properly"
    );
  }

  native_core.InstrumentHooks.setIntegration("codspeed-node", __VERSION__);
  linuxPerf.start();
  checkV8Flags();
};

export const teardownCore = () => {
  linuxPerf.stop();
};

export type {
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
} from "./generated/openapi";
export { getV8Flags, tryIntrospect } from "./introspection";
export { optimizeFunction, optimizeFunctionSync } from "./optimization";
export * from "./utils";
export * from "./walltime";
export const InstrumentHooks = native_core.InstrumentHooks;
