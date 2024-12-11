export const optimizeFunction = async (fn: CallableFunction) => {
  // Source: https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#optimization-killers
  // a total of 7 calls seems to be the sweet spot
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
  fn();
  fn();
  fn();
  fn();
  fn();
  fn();
  eval("%OptimizeFunctionOnNextCall(fn)");
  fn(); // optimize
};
