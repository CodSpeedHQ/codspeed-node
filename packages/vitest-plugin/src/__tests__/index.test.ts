import { getV8Flags } from "@codspeed/core";
import { fromPartial } from "@total-typescript/shoehorn";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ViteUserConfig } from "vitest/config";
import codspeedPlugin from "../index";

const coreMocks = vi.hoisted(() => {
  return {
    InstrumentHooks: {
      isInstrumented: vi.fn(),
    },
  };
});

const vitestMock = vi.hoisted(() => ({ version: "" }));

vi.mock("@codspeed/core", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@codspeed/core")>();
  return { ...mod, ...coreMocks };
});

vi.mock("vitest/node", () => ({
  get version() {
    return vitestMock.version;
  },
}));

console.warn = vi.fn();

const plugin = codspeedPlugin();

function apply(mode: string) {
  if (typeof plugin.apply !== "function")
    throw new Error("apply is not a function");
  return plugin.apply({}, fromPartial({ mode }));
}

function config(userConfig: ViteUserConfig = {}) {
  if (typeof plugin.config !== "function")
    throw new Error("config is not a function");
  return plugin.config.call({} as never, userConfig, fromPartial({}));
}

describe("codSpeedPlugin", () => {
  beforeEach(() => {
    vi.stubEnv("CODSPEED_ENV", "1");
    vi.stubEnv("CODSPEED_RUNNER_MODE", "instrumentation");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should enforce to run after the other plugins", () => {
    expect(plugin.enforce).toBe("post");
  });

  describe("Vitest 3/4", () => {
    beforeEach(() => {
      vitestMock.version = "4.0.18";
    });

    it("should not apply the plugin when the mode is not benchmark", () => {
      expect(apply("test")).toBe(false);
    });

    it("should apply the plugin when there is no instrumentation", () => {
      coreMocks.InstrumentHooks.isInstrumented.mockReturnValue(false);

      expect(apply("benchmark")).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        "[CodSpeed] bench detected but no instrumentation found",
      );
    });

    it("should apply the plugin when there is instrumentation", () => {
      coreMocks.InstrumentHooks.isInstrumented.mockReturnValue(true);

      expect(apply("benchmark")).toBe(true);
    });

    it("should apply the codspeed config for v4", () => {
      expect(config()).toStrictEqual({
        test: {
          globalSetup: [
            expect.stringContaining(
              "packages/vitest-plugin/src/globalSetup.ts",
            ),
          ],
          pool: "forks",
          execArgv: getV8Flags(),
          runner: expect.stringContaining(
            "packages/vitest-plugin/src/legacy/analysis.ts",
          ),
        },
      });
    });

    it("should apply the codspeed config for v3 with poolOptions", () => {
      vitestMock.version = "3.2.0";

      expect(config()).toStrictEqual({
        test: {
          globalSetup: [
            expect.stringContaining(
              "packages/vitest-plugin/src/globalSetup.ts",
            ),
          ],
          pool: "forks",
          poolOptions: {
            forks: {
              execArgv: getV8Flags(),
            },
          },
          runner: expect.stringContaining(
            "packages/vitest-plugin/src/legacy/analysis.ts",
          ),
        },
      });
    });
  });

  describe("Vitest 5", () => {
    beforeEach(() => {
      vitestMock.version = "5.0.0";
    });

    it("should apply the plugin in any mode when CodSpeed drives the run", () => {
      expect(apply("test")).toBe(true);
    });

    it("should not apply the plugin when CodSpeed is not driving the run", () => {
      vi.stubEnv("CODSPEED_ENV", undefined);

      expect(apply("test")).toBe(false);
    });

    it("should wire the benchmark provider", () => {
      expect(config()).toStrictEqual({
        test: {
          globalSetup: [
            expect.stringContaining(
              "packages/vitest-plugin/src/globalSetup.ts",
            ),
          ],
          pool: "forks",
          execArgv: getV8Flags(),
          benchmark: {
            provider: expect.stringContaining(
              "packages/vitest-plugin/src/v5/provider.ts",
            ),
            suppressExportGetterWarnings: true,
          },
        },
      });
    });

    it("should keep an explicit suppressExportGetterWarnings from the user", () => {
      const result = config({
        test: { benchmark: { suppressExportGetterWarnings: false } },
      }) as ViteUserConfig;

      expect(result.test?.benchmark?.suppressExportGetterWarnings).toBe(false);
    });
  });
});
