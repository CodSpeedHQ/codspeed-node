import { describe, test } from "vitest";
import {
  iterativeFibonacci as iterativeFibonacciExport,
  recursiveFibonacci as recursiveFibonacciExport,
} from "./fibonacci";

// Imports are getters under Vite's module runner; read them once, outside the
// measured loop.
const recursiveFibonacci = recursiveFibonacciExport;
const iterativeFibonacci = iterativeFibonacciExport;

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
