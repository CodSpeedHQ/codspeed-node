import { writeFileSync } from "fs";
import path from "path";

const getV8Flags = (nodeVersionMajor: number) => {
  const flags = [
    "--hash-seed=1",
    "--random-seed=1",
    "--no-opt",
    "--predictable",
    "--predictable-gc-schedule",
    "--interpreted-frames-native-stack",
    "--perf-basic-prof",
  ];
  if (nodeVersionMajor < 18) {
    flags.push("--no-randomize-hashes");
  }
  if (nodeVersionMajor < 20) {
    flags.push("--no-scavenge-task");
  }
  return flags;
};

if (process.env.__CODSPEED_NODE_CORE_INTROSPECTION_PATH__ !== undefined) {
  const nodeVersionMajor = parseInt(process.version.slice(1).split(".")[0]);

  const introspectionMetadata = {
    flags: getV8Flags(nodeVersionMajor),
  };
  writeFileSync(
    process.env.__CODSPEED_NODE_CORE_INTROSPECTION_PATH__,
    JSON.stringify(introspectionMetadata)
  );
  process.exit(0);
}

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
} catch (e) {
  m = {
    isInstrumented: () => false,
    startInstrumentation: () => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    stopInstrumentation: (at) => {},
    isBound: false,
  };
}
const skipOptimization = process.env.CODSPEED_FORCE_OPTIMIZATION !== "true";
export const measurement = m;
export const initCore = () => {
  if (!skipOptimization) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("v8").setFlagsFromString("--allow-natives-syntax");
  }
  measurement.stopInstrumentation(`Metadata: codspeed-node ${__VERSION__}`);
};

export const optimizeFunction = async (fn: CallableFunction) => {
  if (skipOptimization) {
    // warmup V8 symbols generation of the performance map
    await fn();
    return;
  }
  // Source: https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#optimization-killers
  await fn(); //Fill type-info
  await fn(); // 2 calls are needed to go from uninitialized -> pre-monomorphic -> monomorphic
  eval("%OptimizeFunctionOnNextCall(fn)");
  await fn(); // optimize
};

export const optimizeFunctionSync = (fn: CallableFunction) => {
  if (skipOptimization) {
    // warmup V8 symbols generation of the performance map
    fn();
    return;
  }
  // Source: https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#optimization-killers
  fn(); //Fill type-info
  fn(); // 2 calls are needed to go from uninitialized -> pre-monomorphic -> monomorphic
  eval("%OptimizeFunctionOnNextCall(fn)");
  fn(); // optimize
};
