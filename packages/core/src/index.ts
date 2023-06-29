import { tryIntrospect } from "./introspection";
tryIntrospect();

import native_core from "./native_core";
import { initOptimization } from "./optimization";

declare const __VERSION__: string;

const linuxPerf = new native_core.LinuxPerf();

export const isBound = native_core.isBound;

export const setupCore = () => {
  initOptimization();
  native_core.Measurement.stopInstrumentation(
    `Metadata: codspeed-node ${__VERSION__}`
  );
  linuxPerf.start();
};

export const teardownCore = () => {
  linuxPerf.stop();
};

export { optimizeFunction, optimizeFunctionSync } from "./optimization";
export const Measurement = native_core.Measurement;
