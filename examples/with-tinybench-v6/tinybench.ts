import { withCodSpeed } from "@codspeed/tinybench-plugin";
import { Bench } from "tinybench";

function recursiveFibonacci(n: number): number {
  if (n < 2) {
    return n;
  }
  return recursiveFibonacci(n - 1) + recursiveFibonacci(n - 2);
}

// The plugin resolves tinybench's `Bench` type from the version hoisted at the
// monorepo root, which differs from the major pinned in this example. A real
// consumer has a single installed tinybench, so this mismatch is local to the
// workspace; `@ts-expect-error` keeps the example typechecking and flags us if
// the discrepancy ever resolves on its own.
// @ts-expect-error cross-version Bench type mismatch within the monorepo
const bench = withCodSpeed(new Bench({ time: 100, warmup: true }));

bench
  .add("recursive fibo 10", () => {
    recursiveFibonacci(10);
  })
  // Register the per-task hooks so the plugin's handling of them is exercised.
  .add(
    "recursive fibo 15 with hooks",
    () => {
      recursiveFibonacci(15);
    },
    {
      beforeAll() {},
      beforeEach() {},
      afterEach() {},
      afterAll() {},
    },
  );

bench.run().then(() => {
  console.table(bench.table());
});
