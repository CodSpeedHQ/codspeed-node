import { join } from "path";

import { Plugin } from "vite";
import { type ViteUserConfig } from "vitest/config";

import {
  getInstrumentMode,
  getV8Flags,
  InstrumentHooks,
  mongoMeasurement,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
} from "@codspeed/core";

import { resolveVitestBackend } from "./vitestBackend";

// get this file's directory path from import.meta.url
const __dirname = new URL(".", import.meta.url).pathname;
const isFileInTs = import.meta.url.endsWith(".ts");

/**
 * Resolve a plugin-owned file (globalSetup, seam entry points) shipped alongside
 * this module. Source (`.ts`) and built (`.mjs`) layouts are kept identical (see
 * rollup.config.ts), so the same relative `name` works in both.
 */
function resolveFile(name: string): string {
  const fileExtension = isFileInTs ? "ts" : "mjs";
  return join(__dirname, `${name}.${fileExtension}`);
}

export default function codspeedPlugin(): Plugin {
  // Resolved lazily on each hook rather than once here: the installed Vitest
  // version is detected from the project's cwd, which isn't reliably knowable at
  // plugin-construction time (and tests swap it between construction and use).
  return {
    name: "codspeed:vitest",
    apply(_, { mode }) {
      if (!resolveVitestBackend().isActiveForViteMode(mode)) {
        return false;
      }
      if (
        getInstrumentMode() == "analysis" &&
        !InstrumentHooks.isInstrumented()
      ) {
        console.warn("[CodSpeed] bench detected but no instrumentation found");
      }
      return true;
    },
    enforce: "post",
    config(incomingConfig, { mode }): ViteUserConfig | undefined {
      const backend = resolveVitestBackend();
      if (!backend.isBenchmarkRun(incomingConfig, mode)) {
        return backend.getIdleConfig(incomingConfig);
      }

      const benchmarkConfig = backend.getBenchmarkConfig(
        incomingConfig,
        getV8Flags(),
        resolveFile,
      );

      return {
        ...benchmarkConfig,
        test: {
          globalSetup: [resolveFile("globalSetup")],
          ...benchmarkConfig.test,
        },
      };
    },
  };
}

/**
 * Dynamically setup the CodSpeed instruments.
 */
export async function setupInstruments(
  body: SetupInstrumentsRequestBody,
): Promise<SetupInstrumentsResponse> {
  if (!InstrumentHooks.isInstrumented()) {
    console.warn("[CodSpeed] No instrumentation found, using default mongoUrl");

    return { remoteAddr: body.mongoUrl };
  }

  return await mongoMeasurement.setupInstruments(body);
}

export { codspeedLaunchOptions } from "./browserCommands";
