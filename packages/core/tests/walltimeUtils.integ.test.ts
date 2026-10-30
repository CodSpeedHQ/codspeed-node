import { samplesToResult } from "../src/walltime/utils";

describe("samplesToResult", () => {
  it("computes pooled statistics", () => {
    const samples = [2, 4, 4, 4, 5, 5, 7, 9];
    const { totalTime, latency } = samplesToResult(samples);
    expect(totalTime).toBe(40);
    expect(latency.min).toBe(2);
    expect(latency.max).toBe(9);
    expect(latency.mean).toBe(5);
    // sample standard deviation: sqrt(32 / 7)
    expect(latency.sd).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });

  it("has zero deviation for a single sample", () => {
    const { totalTime, latency } = samplesToResult([3]);
    expect(totalTime).toBe(3);
    expect(latency).toMatchObject({ min: 3, max: 3, mean: 3, sd: 0 });
  });

  it("handles very large sample counts without overflowing the stack", () => {
    const samples = new Array(500_000).fill(1);
    expect(samplesToResult(samples).totalTime).toBe(500_000);
  });

  it("rejects empty samples", () => {
    expect(() => samplesToResult([])).toThrow(
      "[CodSpeed] Cannot compute statistics from empty samples",
    );
  });
});
