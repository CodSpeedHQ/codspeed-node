// Run by `isolation.integ.test.ts`. Runs two benchmarks through `Isolation`.
const { Isolation } = require("../../dist/index.cjs.js");

const isolation = Isolation.current();

function bench(uri) {
  console.log(`ran ${process.pid} ${uri} ${JSON.stringify(process.execArgv)}`);
  switch (process.env.ISOLATION_FIXTURE_ACTION) {
    case "exit":
      process.exit(3);
    case "kill":
      process.kill(process.pid, "SIGKILL");
  }
}

async function main() {
  for (const uri of ["a", "b"]) {
    if (!isolation.shouldRun(uri)) continue;
    if (process.env.ISOLATION_FIXTURE_SYNC !== undefined) {
      isolation.runSync(uri, () => bench(uri));
    } else {
      await isolation.run(uri, async () => bench(uri));
    }
  }
}

main();
