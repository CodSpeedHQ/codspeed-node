import { describe, test } from "vitest";
import { recursiveFibonacci as recursiveFibonacciExport } from "./fibonacci";

// Imports are getters under Vite's module runner; read them once, outside the
// measured loop.
const recursiveFibonacci = recursiveFibonacciExport;

describe("recursiveFibonacci", () => {
  test("fibo 30", async ({ bench }) => {
    await bench("fibo 30", () => {
      recursiveFibonacci(30);
    }).run();
  });
});
