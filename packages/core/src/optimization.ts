// %OptimizeFunctionOnNextCall aborts the process on V8 >= 14.6 unless the function
// was marked with %PrepareFunctionForOptimization first.
//
// Both calls must stay inline: `fn` is only referenced inside an eval string, so a
// helper taking it as a parameter looks unused and bundlers drop the argument.

export const optimizeFunction = async (fn: CallableFunction) => {
  // Source: https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#optimization-killers
  // a total of 7 calls seems to be the sweet spot
  eval("%PrepareFunctionForOptimization(fn)");
  await fn();
  await fn();
  await fn();
  await fn();
  await fn();
  await fn();
  eval("%OptimizeFunctionOnNextCall(fn)");
  await fn(); // optimize
};

export const optimizeFunctionSync = (fn: CallableFunction) => {
  // Source: https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#optimization-killers
  // a total of 7 calls seems to be the sweet spot
  eval("%PrepareFunctionForOptimization(fn)");
  fn();
  fn();
  fn();
  fn();
  fn();
  fn();
  eval("%OptimizeFunctionOnNextCall(fn)");
  fn(); // optimize
};
