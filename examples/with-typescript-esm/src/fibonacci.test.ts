import { describe, expect, it } from "vitest";
import { iterativeFibonacci } from "./fibonacci";

describe("iterativeFibonacci", () => {
  it("should return the correct value", () => {
    expect(iterativeFibonacci(1)).toBe(1);
  });
});
