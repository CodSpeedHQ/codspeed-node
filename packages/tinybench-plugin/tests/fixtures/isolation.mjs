// Run by `isolation.integ.test.ts`. Prints the PID that measures each benchmark.
import { InstrumentHooks } from "@codspeed/core";
import { Bench } from "tinybench";
import { withCodSpeed } from "../../dist/index.es5.js";

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

// tinybench calls each function once when it is added, so a failing benchmark
// may only throw once the measurement started.
let measuring = false;
const startBenchmark = InstrumentHooks.startBenchmark;
InstrumentHooks.startBenchmark = () => {
  measuring = true;
  startBenchmark();
};

const bench = withCodSpeed(new Bench({ time: 1, warmupTime: 0 }));

for (const name of ["first", "second", "third"]) {
  bench.add(name, () => {});
}

if (process.env.ISOLATION_FIXTURE_FAIL !== undefined) {
  bench.add("failing", () => {
    if (measuring) {
      throw new Error("benchmark failed");
    }
  });
}

if (process.env.ISOLATION_FIXTURE_SYNC !== undefined) {
  bench.runSync();
} else {
  await bench.run();
}
