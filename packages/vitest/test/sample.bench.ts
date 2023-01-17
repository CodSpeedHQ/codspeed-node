import { describe } from "vitest";
import { bench } from "../src/index";
describe("sort", () => {
  bench("normal", () => {
    const x = [1, 5, 4, 2, 3];
    x.sort((a, b) => {
      return a - b;
    });
  });

  bench("reverse", () => {
    const x = [1, 5, 4, 2, 3];
    x.reverse().sort((a, b) => {
      return a - b;
    });
  });
});
