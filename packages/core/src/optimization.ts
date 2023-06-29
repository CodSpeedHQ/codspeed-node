const skipOptimization = process.env.CODSPEED_FORCE_OPTIMIZATION !== "true";

export const initOptimization = () => {
  if (!skipOptimization) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("v8").setFlagsFromString("--allow-natives-syntax");
  }
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
