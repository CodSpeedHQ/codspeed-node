// Run by `isolation.integ.test.ts`. Measures benchmark "a" in forks.
const {
  runForks,
  runForksSync,
  walltimeIsolation,
  writeForkSamples,
} = require("../../dist/index.cjs.js");

const mode = walltimeIsolation();

function measure() {
  console.log(`ran ${process.pid} ${JSON.stringify(process.execArgv)}`);
  switch (process.env.ISOLATION_FIXTURE_ACTION) {
    case "exit":
      process.exit(3);
    case "no-samples":
      process.exit(0);
  }
  writeForkSamples(mode.samplesFile, [Number(process.pid), 1]);
}

async function main() {
  if (mode.kind === "Fork") {
    measure();
    return;
  }
  const forks = Number(process.env.ISOLATION_FIXTURE_FORKS);
  const samples =
    process.env.ISOLATION_FIXTURE_SYNC !== undefined
      ? runForksSync("a", forks)
      : await runForks("a", forks);
  console.log(`samples ${samples.length}`);
}

// A rejection ends the process with exit code 1.
main();
