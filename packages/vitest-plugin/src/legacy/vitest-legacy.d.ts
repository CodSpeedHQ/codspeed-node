// `vitest/runners` and `vitest/suite` only exist on Vitest 3/4, but the package
// is type-checked against Vitest 5.
//
// Must stay a script (no top-level imports): a `declare module` inside a module
// is an augmentation, which requires the module to resolve.

declare module "vitest/runners" {
  export const NodeBenchmarkRunner: import("./compat").LegacyBenchmarkApi["NodeBenchmarkRunner"];
}

declare module "vitest/suite" {
  export const getHooks: import("./compat").LegacyBenchmarkApi["getHooks"];
  export const getBenchFn: import("./compat").LegacyBenchmarkApi["getBenchFn"];
  export const getBenchOptions: import("./compat").LegacyBenchmarkApi["getBenchOptions"];
}
