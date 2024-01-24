import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  bench,
  describe,
  expect,
} from "vitest";

let count = -1;

beforeAll(() => {
  count += 1;
});

beforeEach(() => {
  count += 1;
});

// the count is multiplied by 2 because the bench function is called twice with codspeed (once for the optimization and once for the actual measurement)
bench("one", () => {
  expect(count).toBe(1 * 2);
});

describe("level1", () => {
  bench("two", () => {
    expect(count).toBe(2 * 2);
  });

  bench("three", () => {
    expect(count).toBe(3 * 2);
  });

  describe("level 2", () => {
    beforeEach(() => {
      count += 1;
    });

    bench("five", () => {
      expect(count).toBe(5 * 2);
    });

    describe("level 3", () => {
      bench("seven", () => {
        expect(count).toBe(7 * 2);
      });
    });
  });

  describe("level 2 bench nested beforeAll", () => {
    beforeAll(() => {
      count = 0;
    });

    bench("one", () => {
      expect(count).toBe(1 * 2);
    });
  });

  bench("two", () => {
    expect(count).toBe(2 * 2);
  });
});

describe("hooks cleanup", () => {
  let cleanUpCount = 0;
  describe("run", () => {
    beforeAll(() => {
      cleanUpCount += 10;
    });
    beforeEach(() => {
      cleanUpCount += 1;
    });
    afterEach(() => {
      cleanUpCount -= 1;
    });
    afterAll(() => {
      cleanUpCount -= 10;
    });

    bench("one", () => {
      expect(cleanUpCount).toBe(11);
    });
    bench("two", () => {
      expect(cleanUpCount).toBe(11);
    });
  });
  bench("end", () => {
    expect(cleanUpCount).toBe(0);
  });
});
