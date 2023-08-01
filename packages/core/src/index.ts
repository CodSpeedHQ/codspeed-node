import { checkV8Flags } from "./introspection";
import { MongoMeasurement } from "./mongoMeasurement";
import native_core from "./native_core";
import { initOptimization } from "./optimization";

declare const __VERSION__: string;

const linuxPerf = new native_core.LinuxPerf();

export const isBound = native_core.isBound;

export let mongoMeasurement: MongoMeasurement;

export const setupCore = () => {
  initOptimization();
  native_core.Measurement.stopInstrumentation(
    `Metadata: codspeed-node ${__VERSION__}`
  );
  linuxPerf.start();
  checkV8Flags();
  mongoMeasurement = new MongoMeasurement();
};

export const teardownCore = async () => {
  linuxPerf.stop();
  const aggregate = await mongoMeasurement.terminate();
  if (aggregate !== undefined) {
    console.log(`[CodSpeed] Mongo Aggregate: ${aggregate}`);
    return aggregate;
  }
  console.log(`[CodSpeed] Mongo Aggregate: no aggregate`);
};

export { getV8Flags, tryIntrospect } from "./introspection";
export { optimizeFunction, optimizeFunctionSync } from "./optimization";
export * from "./utils";
export const Measurement = native_core.Measurement;
