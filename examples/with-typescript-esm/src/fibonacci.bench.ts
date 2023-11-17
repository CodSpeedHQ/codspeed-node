import { bench, describe } from "vitest";
import { iterativeFibonacci } from "./fibonacci";

describe("iterativeFibonacci", () => {
  bench("fibo 10", () => {
    iterativeFibonacci(10);
  });
});
