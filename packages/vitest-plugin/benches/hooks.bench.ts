import { describe, expect, test } from "vitest";

// Exercises tinybench's per-benchmark hooks, which Vitest 5 exposes through the
// `bench(name, options, fn)` options object (`beforeAll`/`beforeEach`/...).
describe("hooks", () => {
  let count = 0;

  describe("run", () => {
    const hooks = {
      beforeAll: () => {
        count += 10;
      },
      beforeEach: () => {
        count += 1;
      },
      afterEach: () => {
        count -= 1;
      },
      afterAll: () => {
        count -= 10;
      },
    };

    test("one", async ({ bench }) => {
      await bench("one", hooks, () => {
        expect(count).toBe(11);
      }).run();
    });

    test("two", async ({ bench }) => {
      await bench("two", hooks, () => {
        expect(count).toBe(11);
      }).run();
    });
  });

  test("end", async ({ bench }) => {
    await bench("end", () => {
      expect(count).toBe(0);
    }).run();
  });
});
