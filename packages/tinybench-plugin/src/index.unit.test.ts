import { Bench } from "tinybench";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCodSpeed } from ".";

const mockAnalysis = vi.hoisted(() => ({
  setupCodspeedAnalysisBench: vi.fn(),
}));

vi.mock("./analysis", () => ({
  ...mockAnalysis,
}));

const mockWalltime = vi.hoisted(() => ({
  setupCodspeedWalltimeBench: vi.fn(),
}));

vi.mock("./walltime", () => ({
  ...mockWalltime,
}));

describe("withCodSpeed behavior without different codspeed modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure no CODSPEED env vars are set
    delete process.env.CODSPEED_ENV;
    delete process.env.CODSPEED_RUNNER_MODE;
  });

  it("should return the same bench instance unchanged when no CODSPEED_ENV", async () => {
    const originalBench = new Bench({ iterations: 10, time: 10 });
    const wrappedBench = withCodSpeed(originalBench);
    const shouldBeCalled = vi.fn();
    wrappedBench.add("test task", shouldBeCalled);
    await wrappedBench.run();

    // Should return the exact same instance
    expect(wrappedBench).toBe(originalBench);
    expect(shouldBeCalled.mock.calls.length).toBeGreaterThan(1000);
  });

  it("should run in analysis mode when CODSPEED_RUNNER_MODE=instrumentation", async () => {
    process.env.CODSPEED_ENV = "true";
    process.env.CODSPEED_RUNNER_MODE = "instrumentation";

    withCodSpeed(new Bench());

    expect(mockAnalysis.setupCodspeedAnalysisBench).toHaveBeenCalled();
    expect(mockWalltime.setupCodspeedWalltimeBench).not.toHaveBeenCalled();
  });

  it("should run in analysis mode when CODSPEED_RUNNER_MODE=simulation", async () => {
    process.env.CODSPEED_ENV = "true";
    process.env.CODSPEED_RUNNER_MODE = "simulation";

    withCodSpeed(new Bench());

    expect(mockAnalysis.setupCodspeedAnalysisBench).toHaveBeenCalled();
    expect(mockWalltime.setupCodspeedWalltimeBench).not.toHaveBeenCalled();
  });

  it("should run in analysis mode when CODSPEED_RUNNER_MODE=memory", async () => {
    process.env.CODSPEED_ENV = "true";
    process.env.CODSPEED_RUNNER_MODE = "memory";

    withCodSpeed(new Bench());

    expect(mockAnalysis.setupCodspeedAnalysisBench).toHaveBeenCalled();
    expect(mockWalltime.setupCodspeedWalltimeBench).not.toHaveBeenCalled();
  });

  it("should run in walltime mode when CODSPEED_RUNNER_MODE=walltime", async () => {
    process.env.CODSPEED_ENV = "true";
    process.env.CODSPEED_RUNNER_MODE = "walltime";

    withCodSpeed(new Bench());

    expect(mockAnalysis.setupCodspeedAnalysisBench).not.toHaveBeenCalled();
    expect(mockWalltime.setupCodspeedWalltimeBench).toHaveBeenCalled();
  });
});
