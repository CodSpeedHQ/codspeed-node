// Run by `isolation.integ.test.ts`. Prints the PID of every process that runs a benchmark.
import { Bench } from "tinybench";
import { withCodSpeed } from "../../dist/index.es5.js";

const options = process.env.ISOLATION_FIXTURE_FORKS_OPTION;
const bench = withCodSpeed(
  new Bench({ iterations: 4, time: 1, warmupTime: 0 }),
  options === undefined ? {} : { forks: Number(options) },
);

for (const name of ["first", "second"]) {
  // tinybench calls the function once when it is added, in every process.
  let calls = 0;
  bench.add(name, () => {
    if (++calls === 2) {
      console.log(`ran ${process.pid} ${name}`);
    }
  });
}

if (process.env.ISOLATION_FIXTURE_SYNC !== undefined) {
  bench.runSync();
} else {
  await bench.run();
}
