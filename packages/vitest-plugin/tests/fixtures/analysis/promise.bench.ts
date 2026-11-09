import { appendFileSync } from "fs";
import { setTimeout as sleep } from "timers/promises";
import { test } from "vitest";

// Vitest swallows what workers print, so the order of the benchmark's events
// goes to a file.
function log(event: string) {
  appendFileSync(process.env.ANALYSIS_LOG_FILE!, `${event}\n`);
}

test("benchmarks", async ({ bench }) => {
  // Returns a promise without being declared `async`.
  await bench(
    "returns a promise",
    {
      beforeEach: () => log("beforeEach"),
      afterEach: () => log("afterEach"),
    },
    () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 1);
      return promise.then(() => log("done"));
    },
  ).run();

  // Sync, with async hooks that must finish around each call.
  await bench(
    "async hooks",
    {
      beforeEach: async () => {
        await sleep(1);
        log("beforeEach");
      },
      afterEach: async () => {
        await sleep(1);
        log("afterEach");
      },
    },
    () => log("done"),
  ).run();
});
