import { fromPartial } from "@total-typescript/shoehorn";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import codspeedPlugin from "../index";

const coreMocks = vi.hoisted(() => {
  return {
    InstrumentHooks: {
      isInstrumented: vi.fn(),
    },
  };
});

const fsMocks = vi.hoisted(() => {
  let mockVersion = "4.0.18"; // default to v4
  return {
    readFileSync: vi.fn((path: string) => {
      if (path.includes("vitest/package.json")) {
        return JSON.stringify({ version: mockVersion });
      }
      throw new Error(`File not found: ${path}`);
    }),
    setMockVersion: (version: string) => {
      mockVersion = version;
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

vi.mock("fs", () => {
  return {
    readFileSync: fsMocks.readFileSync,
  };
});

console.warn = vi.fn();

describe("codSpeedPlugin", () => {
  beforeAll(() => {
    // Set environment variables to trigger instrumented mode
    process.env.CODSPEED_ENV = "1";
    process.env.CODSPEED_RUNNER_MODE = "instrumentation";
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env.CODSPEED_ENV;
    delete process.env.CODSPEED_RUNNER_MODE;
  });

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

    it("should apply the plugin when there is no instrumentation", async () => {
      coreMocks.InstrumentHooks.isInstrumented.mockReturnValue(false);

      const applyPlugin = applyPluginFunction(
        {},
        fromPartial({ mode: "benchmark" })
      );

      expect(console.warn).toHaveBeenCalledWith(
        "[CodSpeed] bench detected but no instrumentation found"
      );
      expect(applyPlugin).toBe(true);
    });

    it("should apply the plugin when there is instrumentation", async () => {
      coreMocks.InstrumentHooks.isInstrumented.mockReturnValue(true);

      const applyPlugin = applyPluginFunction(
        {},
        fromPartial({ mode: "benchmark" })
      );

      expect(applyPlugin).toBe(true);
    });
  });

  it("should apply the codspeed config for v4", () => {
    const config = resolvedCodSpeedPlugin.config;
    if (typeof config !== "function")
      throw new Error("config is not a function");

    const result = config.call({} as never, {}, fromPartial({}));

    expect(result).toStrictEqual({
      test: {
        globalSetup: [
          expect.stringContaining("packages/vitest-plugin/src/globalSetup.ts"),
        ],
        pool: "forks",
        execArgv: [
          "--interpreted-frames-native-stack",
          "--allow-natives-syntax",
          "--hash-seed=1",
          "--random-seed=1",
          "--no-opt",
          "--predictable",
          "--predictable-gc-schedule",
          "--expose-gc",
          "--no-concurrent-sweeping",
          "--max-old-space-size=4096",
        ],
        runner: expect.stringContaining(
          "packages/vitest-plugin/src/analysis.ts"
        ),
      },
    });
  });

  it("should apply the codspeed config for v3 with poolOptions", () => {
    // Set mock version to v3
    fsMocks.setMockVersion("3.2.0");

    // Create a new plugin instance to pick up the mocked version
    const v3Plugin = codspeedPlugin();
    const config = v3Plugin.config;
    if (typeof config !== "function")
      throw new Error("config is not a function");

    const result = config.call({} as never, {}, fromPartial({}));

    expect(result).toStrictEqual({
      test: {
        globalSetup: [
          expect.stringContaining("packages/vitest-plugin/src/globalSetup.ts"),
        ],
        pool: "forks",
        poolOptions: {
          forks: {
            execArgv: [
              "--interpreted-frames-native-stack",
              "--allow-natives-syntax",
              "--hash-seed=1",
              "--random-seed=1",
              "--no-opt",
              "--predictable",
              "--predictable-gc-schedule",
              "--expose-gc",
              "--no-concurrent-sweeping",
              "--max-old-space-size=4096",
            ],
          },
        },
        runner: expect.stringContaining(
          "packages/vitest-plugin/src/analysis.ts"
        ),
      },
    });

    // Reset mock version back to v4
    fsMocks.setMockVersion("4.0.18");
  });
});
