import { describe, test } from "vitest";
import { iterativeFibonacci, recursiveFibonacci } from "./fibonacci";

describe("fibonacci", () => {
  test("fibo 15", async ({ bench }) => {
    await bench.compare(
      bench("recursive", () => {
        recursiveFibonacci(15);
      }),
      bench("iterative", () => {
        iterativeFibonacci(15);
      }),
    );
  });

  test("fibo 20", async ({ bench }) => {
    await bench.compare(
      bench("recursive", () => {
        recursiveFibonacci(20);
      }),
      bench("iterative", () => {
        iterativeFibonacci(20);
      }),
    );
  });
});
