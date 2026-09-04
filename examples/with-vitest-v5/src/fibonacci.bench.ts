import { describe, test } from "vitest";
import {
  iterativeFibonacci as iterativeFibonacciExport,
  recursiveFibonacci as recursiveFibonacciExport,
} from "./fibonacci";

// Read the imported bindings once: Vite's module runner exposes exports through
// getters, and reading one inside the measured loop adds overhead to every
// iteration (Vitest warns about it).
const recursiveFibonacci = recursiveFibonacciExport;
const iterativeFibonacci = iterativeFibonacciExport;

// Vitest 5 declares benchmarks through the `bench` test-context fixture: each
// `bench()` returns a registration that runs on `.run()`, or as part of a
// `bench.compare()` group.
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
