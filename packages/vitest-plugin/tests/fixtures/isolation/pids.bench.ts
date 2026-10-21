import { describe, test } from "vitest";

describe("isolation", () => {
  test("benchmarks", async ({ bench }) => {
    const benchmarks = [
      bench("first", () => {}),
      bench("second", () => {}),
      bench("third", () => {}),
    ];
    if (process.env.ISOLATION_FIXTURE_FAIL !== undefined) {
      benchmarks.push(
        bench("failing", () => {
          throw new Error("benchmark failed");
        }),
      );
    }
    await bench.compare(...benchmarks);
  });
});
