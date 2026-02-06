import {
  getCodspeedRunnerMode,
  getInstrumentMode,
  getV8Flags,
  InstrumentHooks,
  mongoMeasurement,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
} from "@codspeed/core";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { join } from "path";
import { Plugin } from "vite";
import { type ViteUserConfig } from "vitest/config";

// get this file's directory path from import.meta.url
const __dirname = new URL(".", import.meta.url).pathname;
const isFileInTs = import.meta.url.endsWith(".ts");

function getCodSpeedFileFromName(name: string) {
  const fileExtension = isFileInTs ? "ts" : "mjs";

  return join(__dirname, `${name}.${fileExtension}`);
}

function getVitestMajorVersion(): number | null {
  try {
    // Resolve vitest from the project's perspective (cwd), not from the plugin's location
    // This ensures we detect the vitest version the user has installed
    const require = createRequire(join(process.cwd(), "package.json"));
    const vitestPkgPath = require.resolve("vitest/package.json");
    const vitestPkg = JSON.parse(readFileSync(vitestPkgPath, "utf-8"));
    return parseInt(vitestPkg.version.split(".")[0], 10);
  } catch {
    return null;
  }
}

function getRunnerFile(): string | undefined {
  const instrumentMode = getInstrumentMode();
  if (instrumentMode === "disabled") {
    return undefined;
  }

  return getCodSpeedFileFromName(instrumentMode);
}

export default function codspeedPlugin(): Plugin {
  return {
    name: "codspeed:vitest",
    apply(_, { mode }) {
      if (mode !== "benchmark") {
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
    config(): ViteUserConfig {
      const runnerFile = getRunnerFile();
      const runnerMode = getCodspeedRunnerMode();
      const v8Flags = getV8Flags();
      const vitestMajorVersion = getVitestMajorVersion();
      // by default, assume Vitest v4 or higher
      const isVitestV4OrHigher = (vitestMajorVersion ?? 4) >= 4;

      const config: ViteUserConfig = {
        test: {
          pool: "forks",
          ...(isVitestV4OrHigher
            ? { execArgv: v8Flags }
            : {
                // Compat with Vitest v3
                // See: https://vitest.dev/guide/migration.html#pool-rework
                // poolOptions only exists in Vitest v3
                poolOptions: {
                  forks: {
                    execArgv: v8Flags,
                  },
                },
              }),
          globalSetup: [getCodSpeedFileFromName("globalSetup")],
          ...(runnerFile && {
            runner: runnerFile,
          }),
          ...(runnerMode === "walltime" && {
            benchmark: {
              includeSamples: true,
            },
          }),
        },
      };

      return config;
    },
  };
}

/**
 * Dynamically setup the CodSpeed instruments.
 */
export async function setupInstruments(
  body: SetupInstrumentsRequestBody
): Promise<SetupInstrumentsResponse> {
  if (!InstrumentHooks.isInstrumented()) {
    console.warn("[CodSpeed] No instrumentation found, using default mongoUrl");

    return { remoteAddr: body.mongoUrl };
  }

  return await mongoMeasurement.setupInstruments(body);
}
