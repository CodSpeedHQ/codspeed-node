import { checkV8Flags } from "./introspection";
import { MongoMeasurement } from "./mongoMeasurement";
import native_core from "./native_core";

declare const __VERSION__: string;

const linuxPerf = new native_core.LinuxPerf();

export const isBound = native_core.isBound;

export const mongoMeasurement = new MongoMeasurement();

export const setupCore = () => {
  native_core.Measurement.stopInstrumentation(
    `Metadata: codspeed-node ${__VERSION__}`
  );
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
export const Measurement = native_core.Measurement;
