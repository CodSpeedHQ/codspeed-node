import { Bench, Hook } from "tinybench";

// The benchmark options tinybench resolves: timing knobs plus the suite-level
// setup/teardown hooks. tinybench guarantees `setup`/`teardown` are populated
// (at least with no-op defaults), so they are non-optional here.
export interface ResolvedBenchOptions {
  setup: Hook;
  teardown: Hook;
  warmup?: boolean;
  warmupIterations?: number;
  warmupTime?: number;
  iterations?: number;
  time?: number;
  retainSamples?: boolean;
}

// Up to tinybench v5 the resolved options lived under `bench.opts`; from v6 they
// are flattened onto the bench instance itself. Returning the holder object
// (rather than a copy) keeps in-place mutation of `setup`/`teardown` working,
// which the walltime runner relies on to bracket its instrumentation window.
export function getBenchOptions(bench: Bench): ResolvedBenchOptions {
  const opts = (bench as unknown as { opts?: ResolvedBenchOptions }).opts;
  return opts ?? (bench as unknown as ResolvedBenchOptions);
}
