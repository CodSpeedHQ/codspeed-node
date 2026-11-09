// Run by `isolation.integ.test.ts`. Prints the PID of every process that calls
// a benchmark's function, and of every process that runs the benchmark.
import { Bench } from "tinybench";
import { withCodSpeed } from "../../dist/index.es5.js";

const options = process.env.ISOLATION_FIXTURE_FORKS_OPTION;
const bench = withCodSpeed(
  new Bench({ iterations: 4, time: 1, warmupTime: 0 }),
  options === undefined ? {} : { forks: Number(options) },
);

for (const name of ["first", "second"]) {
  let calls = 0;
  bench.add(name, () => {
    calls++;
    if (calls === 1) {
      console.log(`called ${process.pid} ${name}`);
    }
    // tinybench calls the function once when it is added, to tell whether it
    // returns a promise.
    if (calls === 2) {
      console.log(`ran ${process.pid} ${name}`);
    }
  });
}

if (process.env.ISOLATION_FIXTURE_SYNC !== undefined) {
  bench.runSync();
} else {
  await bench.run();
}
