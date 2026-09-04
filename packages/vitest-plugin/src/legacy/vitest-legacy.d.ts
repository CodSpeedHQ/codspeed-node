// Vitest 3/4 exposed the benchmark internals through the `vitest/runners` and
// `vitest/suite` subpaths, which Vitest 5 removed. `legacy/compat.ts` imports
// them only when the installed Vitest doesn't expose them from its main entry
// point, i.e. only on Vitest 3/4 — but the package is type-checked against
// whichever Vitest is installed, including 5, where the subpaths don't resolve.
// These declarations keep that code compiling; nothing imports them under v5.
//
// This file must stay a script (no top-level imports): a `declare module` inside
// a module is an augmentation, which requires the module to resolve.

declare module "vitest/runners" {
  export const NodeBenchmarkRunner: import("./compat").LegacyBenchmarkApi["NodeBenchmarkRunner"];
}

declare module "vitest/suite" {
  export const getHooks: import("./compat").LegacyBenchmarkApi["getHooks"];
  export const getBenchFn: import("./compat").LegacyBenchmarkApi["getBenchFn"];
  export const getBenchOptions: import("./compat").LegacyBenchmarkApi["getBenchOptions"];
}
