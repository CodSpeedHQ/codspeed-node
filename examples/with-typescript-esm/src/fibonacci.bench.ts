import { describe, test } from "vitest";
import { recursiveFibonacci } from "./fibonacci";

describe("recursiveFibonacci", () => {
  test("fibo 30", async ({ bench }) => {
    await bench("fibo 30", () => {
      recursiveFibonacci(30);
    }).run();
  });
});
