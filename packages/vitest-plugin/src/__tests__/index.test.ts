import { fromPartial } from "@total-typescript/shoehorn";
import { describe, expect, it, vi } from "vitest";
import codspeedPlugin from "../index";

const coreMocks = vi.hoisted(() => {
  return {
    Measurement: {
      isInstrumented: vi.fn(),
      startInstrumentation: vi.fn(),
      stopInstrumentation: vi.fn(),
    },
  };
});

const resolvedCodSpeedPlugin = codspeedPlugin();
const applyPluginFunction = resolvedCodSpeedPlugin.apply;
if (typeof applyPluginFunction !== "function")
  throw new Error("applyPluginFunction is not a function");

vi.mock("@codspeed/core", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@codspeed/core")>();
  return { ...mod, ...coreMocks };
});

console.warn = vi.fn();

describe("codSpeedPlugin", () => {
  it("should have a name", async () => {
    expect(resolvedCodSpeedPlugin.name).toBe("codspeed:vitest");
  });

  it("should enforce to run after the other plugins", async () => {
    expect(resolvedCodSpeedPlugin.enforce).toBe("post");
  });

  describe("apply", () => {
    it("should not apply the plugin when the mode is not benchmark", async () => {
      const applyPlugin = applyPluginFunction(
        {},
        fromPartial({ mode: "test" })
      );

      expect(applyPlugin).toBe(false);
    });

    it("should not apply the plugin when there is no instrumentation", async () => {
      coreMocks.Measurement.isInstrumented.mockReturnValue(false);

      const applyPlugin = applyPluginFunction(
        {},
        fromPartial({ mode: "benchmark" })
      );

      expect(console.warn).toHaveBeenCalledWith(
        "[CodSpeed] bench detected but no instrumentation found, falling back to default vitest runner"
      );
      expect(applyPlugin).toBe(false);
    });

    it("should apply the plugin when there is instrumentation", async () => {
      coreMocks.Measurement.isInstrumented.mockReturnValue(true);

      const applyPlugin = applyPluginFunction(
        {},
        fromPartial({ mode: "benchmark" })
      );

      expect(applyPlugin).toBe(true);
    });
  });

  it("should apply the codspeed config", async () => {
    const config = resolvedCodSpeedPlugin.config;
    if (typeof config !== "function")
      throw new Error("config is not a function");

    expect(config({}, fromPartial({}))).toStrictEqual({
      test: {
        globalSetup: [
          expect.stringContaining(
            "packages/vitest-plugin/src/globalSetup.es5.js"
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
          "packages/vitest-plugin/src/runner.es5.js"
        ),
      },
    });
  });
});
