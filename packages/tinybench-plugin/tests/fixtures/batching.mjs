// Run by `batching.integ.test.ts`. A deterministic clock makes batching
// observable: every benchmark iteration costs exactly one tick, wherever
// tinybench or the plugin reads the clock.
import { Bench } from "tinybench";
import { withCodSpeed } from "../../dist/index.es5.js";

/** Milliseconds one benchmark iteration costs on the fake clock. */
const ITERATION_MS = 0.01;
/** tinybench stops after this many rounds once a round costs 1ms. */
const ROUNDS = 4;
const sync = process.env.BATCHING_FIXTURE_SYNC !== undefined;

// Warmup enabled: the plugin learns the per-iteration cost from the warmup
// rounds and then batches ~1ms worth of iterations per measured round.
let tickA = 0;
const costA = ITERATION_MS;
const benchA = withCodSpeed(
  new Bench({ iterations: ROUNDS, time: 1, warmupTime: 0, now: () => tickA }),
);

benchA.add("batched", () => {
  tickA += costA;
});

// A batched async benchmark must await every iteration of a round: overlapping
// iterations are a bug, and they fail the run instead of skewing the stats.
let inFlight = 0;
if (!sync) {
  benchA.add("async", async () => {
    if (inFlight++ > 0) {
      throw new Error("async iterations overlapped");
    }
    tickA += costA;
    await Promise.resolve();
    inFlight--;
  });
}

// beforeEach/afterEach are only correct when tinybench times each call alone.
let beforeEachCalls = 0;
let afterEachCalls = 0;
let hookedCalls = 0;
benchA.add(
  "hooked",
  () => {
    if (beforeEachCalls > 0 && beforeEachCalls !== hookedCalls + 1) {
      throw new Error("beforeEach did not run for this invocation");
    }
    hookedCalls++;
    tickA += costA;
  },
  {
    beforeAll: () => {
      beforeEachCalls = 0;
      afterEachCalls = 0;
      hookedCalls = 0;
    },
    beforeEach: () => {
      beforeEachCalls++;
    },
    afterEach: () => {
      afterEachCalls++;
    },
    afterAll: () => {
      if (beforeEachCalls !== hookedCalls || afterEachCalls !== hookedCalls) {
        throw new Error("afterEach did not run for every invocation");
      }
    },
  },
);

// Warmup disabled: the plugin calibrates inside the run lifecycle, after the
// suite setup hook has run (which is what decides the iteration cost here).
let tickB = 0;
let costB = ITERATION_MS;
let lifecycleRuns = 0;
const benchB = withCodSpeed(
  new Bench({
    iterations: ROUNDS,
    time: 1,
    warmup: false,
    now: () => tickB,
    setup: (_task, mode) => {
      if (mode === "run") {
        lifecycleRuns++;
        costB = ITERATION_MS / 2;
      }
    },
  }),
);
benchB.add("lifecycle", () => {
  tickB += costB;
});

if (sync) {
  benchA.runSync();
  benchB.runSync();
} else {
  await benchA.run();
  await benchB.run();
}

// A fork that owns another benchmark's URI does not run this suite at all.
if (lifecycleRuns > 1) {
  throw new Error(`ran the lifecycle ${lifecycleRuns} times`);
}
