// Run by `isolation.integ.test.ts`. Runs one benchmark through `runForks`.
const {
  isFork,
  runForks,
  writeForkSamples,
} = require("../../dist/index.cjs.js");

if (isFork()) {
  console.log(`fork ${process.pid}`);
  switch (process.env.FORKS_FIXTURE_ACTION) {
    case "exit":
      process.exit(3);
    case "no-samples":
      process.exit(0);
  }
  const count = Number(process.env.FORKS_FIXTURE_SAMPLES);
  writeForkSamples(Array.from({ length: count }, (_, i) => i));
} else {
  // A rejection ends the process with exit code 1.
  runForks("a", Number(process.env.FORKS_FIXTURE_COUNT)).then((samples) => {
    console.log(`samples ${samples.length}`);
  });
}
