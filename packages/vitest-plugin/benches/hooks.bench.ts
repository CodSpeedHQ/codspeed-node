import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  bench,
  describe,
  expect,
} from "vitest";

describe("hooks", () => {
  let count = 0;
  describe("run", () => {
    beforeAll(() => {
      count += 10;
    });
    beforeEach(() => {
      count += 1;
    });
    afterEach(() => {
      count -= 1;
    });
    afterAll(() => {
      count -= 10;
    });

    bench("one", () => {
      expect(count).toBe(11);
    });
    bench("two", () => {
      expect(count).toBe(11);
    });
  });
  bench("end", () => {
    expect(count).toBe(0);
  });
});
