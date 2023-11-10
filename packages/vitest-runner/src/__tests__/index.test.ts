import { describe, expect, it, vi } from "vitest";
import { defineConfig, UserConfigFnPromise } from "vitest/config";
import { withCodSpeed } from "../index";

const coreMocks = vi.hoisted(() => {
  return {
    Measurement: {
      isInstrumented: vi.fn(),
      startInstrumentation: vi.fn(),
      stopInstrumentation: vi.fn(),
    },
  };
});

vi.mock("@codspeed/core", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@codspeed/core")>();
  return { ...mod, ...coreMocks };
});

console.warn = vi.fn();

describe("withCodSpeed", () => {
  it("should not apply the codspeed config when there is no instrumentation", async () => {
    coreMocks.Measurement.isInstrumented.mockReturnValue(false);

    const config = defineConfig({});
    const configFunction = (await withCodSpeed(config)) as UserConfigFnPromise;
    expect(typeof configFunction).toBe("function");

    const resultConfig = await configFunction({
      mode: "benchmark",
      command: "build",
    });
    expect(console.warn).toHaveBeenCalledWith(
      "[CodSpeed] bench detected but no instrumentation found, falling back to default vitest runner"
    );
    expect(resultConfig).toStrictEqual(config);
  });

  it("should apply the codspeed config when there is instrumentation", async () => {
    coreMocks.Measurement.isInstrumented.mockReturnValue(true);

    const config = defineConfig({});
    const configFunction = (await withCodSpeed(config)) as UserConfigFnPromise;
    expect(typeof configFunction).toBe("function");

    const resultConfig = await configFunction({
      mode: "benchmark",
      command: "build",
    });
    expect(console.warn).not.toHaveBeenCalled();
    expect(resultConfig).toStrictEqual({
      test: {
        globalSetup: [
          expect.stringContaining(
            "packages/vitest-runner/src/globalSetup.es5.js"
          ),
        ],
        pool: "forks",
        poolOptions: {
          forks: {
            execArgv: [
              "--hash-seed=1",
              "--random-seed=1",
              "--no-opt",
              "--predictable",
              "--predictable-gc-schedule",
              "--interpreted-frames-native-stack",
              "--no-scavenge-task",
            ],
          },
        },
        runner: expect.stringContaining(
          "packages/vitest-runner/src/runner.es5.js"
        ),
      },
    });
  });
});
