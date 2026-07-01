import { describe, test } from "vitest";

const isMacOS = process.platform === "darwin";

function fibo(n: number): number {
  if (n < 2) return 1;
  return fibo(n - 1) + fibo(n - 2);
}

// macOS-only benchmark: skipped on every other platform, so it only runs on
// the `codspeed-walltime-macos` CI job (see .github/workflows/codspeed.yml).
describe.skipIf(!isMacOS)("macos only", () => {
  test("fibo darwin", async ({ bench }) => {
    await bench("fibo darwin", () => {
      fibo(30);
    }).run();
  });
});
