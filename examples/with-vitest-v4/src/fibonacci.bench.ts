import { bench, describe } from "vitest";
import { iterativeFibonacci, recursiveFibonacci } from "./fibonacci";

describe("fibonacci", () => {
  bench("recursive fibo 15", () => {
    recursiveFibonacci(15);
  });

  bench("recursive fibo 20", () => {
    recursiveFibonacci(20);
  });

  bench("iterative fibo 15", () => {
    iterativeFibonacci(15);
  });

  bench("iterative fibo 20", () => {
    iterativeFibonacci(20);
  });
});
