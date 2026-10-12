import { describe, expect, test } from "vitest";

describe("hooks", () => {
  let count = 0;

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

  test("hooked benches", async ({ bench }) => {
    await bench.compare(
      bench("one", hooks, () => {
        expect(count).toBe(11);
      }),
      bench("two", hooks, () => {
        expect(count).toBe(11);
      }),
    );
  });

  test("after the hooked benches", async ({ bench }) => {
    await bench("count is back to zero", () => {
      expect(count).toBe(0);
    }).run();
  });
});
