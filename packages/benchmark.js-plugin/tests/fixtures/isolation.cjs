// Run by `isolation.integ.test.ts`. Prints the PID that measures each benchmark.
const { InstrumentHooks } = require("@codspeed/core");
const Benchmark = require("benchmark");
const { withCodSpeed } = require("../../dist/index.cjs.js");

// There is no instrument hook runtime outside the CodSpeed runner, so pretend
// the hooks are active. The child processes run this file again, so they get
// the same override.
InstrumentHooks.isInstrumented = () => true;

// The plugin reports every measured benchmark here, with the PID of the
// process that measured it.
const setExecutedBenchmark = InstrumentHooks.setExecutedBenchmark;
InstrumentHooks.setExecutedBenchmark = (pid, uri) => {
  setExecutedBenchmark(pid, uri);
  console.log(`executed ${pid} ${uri}`);
};

const suite = withCodSpeed(new Benchmark.Suite("isolation"));

suite
  .add("first", () => {})
  .add("second", () => {})
  .add("third", () => {})
  .add("async", {
    defer: true,
    fn: (deferred) => deferred.resolve(),
  });

if (process.env.ISOLATION_FIXTURE_FAIL !== undefined) {
  suite.add("failing", () => {
    throw new Error("benchmark failed");
  });
}

// Started from a `complete` listener of the first suite: a child measuring
// `chained` only reaches it through that listener.
const chained = withCodSpeed(new Benchmark.Suite("chained"));
chained.add("chained", () => {});
let completed = 0;
suite.on("complete", () => {
  completed++;
  if (completed === suite.length) {
    // After the first run tears down, so the two runs don't overlap.
    setImmediate(() => chained.run());
  }
});

// An unhandled rejection ends the process with exit code 1.
suite.run();
