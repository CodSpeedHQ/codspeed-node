import { bench, describe } from "vitest";
import { recursiveFibonacci } from "./fibonacci";

describe("recursiveFibonacci", () => {
  bench("fibo 30", () => {
    recursiveFibonacci(30);
  });
});
