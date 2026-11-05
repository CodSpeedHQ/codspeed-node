// Run by `isolation.integ.test.ts`. Measures benchmark "a" in forks.
const {
  runForks,
  runForksSync,
  walltimeIsolation,
  writeForkSamples,
} = require("../../dist/index.cjs.js");

const mode = walltimeIsolation();
/** The count a first fork picks; the forks after it inherit it from the parent. */
const CALIBRATED = Number(process.env.ISOLATION_FIXTURE_ITERATIONS ?? 1);

function measure() {
  console.log(`ran ${process.pid} ${JSON.stringify(process.execArgv)}`);
  switch (process.env.ISOLATION_FIXTURE_ACTION) {
    case "exit":
      process.exit(3);
    case "no-samples":
      process.exit(0);
  }
  const inherited = mode.iterationsPerRound;
  // Tells the test whether this fork picked the count or reused the first one.
  console.log(
    `${inherited === undefined ? "calibrated" : "reused"} ${inherited ?? CALIBRATED}`,
  );
  const iterationsPerRound =
    inherited !== undefined &&
    process.env.ISOLATION_FIXTURE_ACTION === "mismatch"
      ? inherited + 1 // batches differently than the first fork
      : (inherited ?? CALIBRATED);
  writeForkSamples(
    mode.samplesFile,
    [Number(process.pid), 1],
    iterationsPerRound,
  );
}

async function main() {
  if (mode.kind === "Fork") {
    measure();
    return;
  }
  const forks = Number(process.env.ISOLATION_FIXTURE_FORKS);
  const result =
    process.env.ISOLATION_FIXTURE_SYNC !== undefined
      ? runForksSync("a", forks)
      : await runForks("a", forks);
  console.log(`samples ${result.samples.length}`);
  console.log(`iterations ${result.iterationsPerRound}`);
}

// A rejection ends the process with exit code 1.
main();
