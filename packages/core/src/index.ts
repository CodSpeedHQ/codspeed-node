import path from "path";
declare const __VERSION__: string;

/* eslint-disable @typescript-eslint/no-empty-function */
export interface Measurement {
  isInstrumented(): boolean;
  startInstrumentation(): void;
  stopInstrumentation(at: string): void;
  isBound: boolean;
}

let m: Measurement;
try {
  m = {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ...require("node-gyp-build")(path.dirname(__dirname)),
    isBound: true,
  } as Measurement;
  console.warn("@codspeed/core binding found");
} catch (e) {
  console.warn("@codspeed/core binding not available on this architecture");
  m = {
    isInstrumented: () => false,
    startInstrumentation: () => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    stopInstrumentation: (at) => {},
    isBound: false,
  };
}
export const measurement = m;
export const initCore = () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("v8").setFlagsFromString("--allow-natives-syntax");
  measurement.stopInstrumentation(`Metadata: codspeed-node ${__VERSION__}`);
};

export const optimizeFunction = async (fn: CallableFunction) => {
  // Source: https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#optimization-killers
  await fn(); //Fill type-info
  await fn(); // 2 calls are needed to go from uninitialized -> pre-monomorphic -> monomorphic
  eval("%OptimizeFunctionOnNextCall(fn)");
  await fn(); // optimize
};

export const optimizeFunctionSync = (fn: CallableFunction) => {
  // Source: https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#optimization-killers
  fn(); //Fill type-info
  fn(); // 2 calls are needed to go from uninitialized -> pre-monomorphic -> monomorphic
  eval("%OptimizeFunctionOnNextCall(fn)");
  fn(); // optimize
};
