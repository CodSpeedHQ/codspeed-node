import {
  getCodspeedRunnerMode,
  getV8Flags,
  Measurement,
  mongoMeasurement,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
} from "@codspeed/core";
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

function getRunnerFile(): string | undefined {
  const codspeedRunnerMode = getCodspeedRunnerMode();
  if (codspeedRunnerMode === "disabled") {
    return undefined;
  }

  return getCodSpeedFileFromName(codspeedRunnerMode);
}

export default function codspeedPlugin(): Plugin {
  return {
    name: "codspeed:vitest",
    apply(_, { mode }) {
      if (mode !== "benchmark") {
        return false;
      }
      if (
        getCodspeedRunnerMode() == "instrumented" &&
        !Measurement.isInstrumented()
      ) {
        console.warn("[CodSpeed] bench detected but no instrumentation found");
      }
      return true;
    },
    enforce: "post",
    config(): ViteUserConfig {
      const runnerFile = getRunnerFile();
      const runnerMode = getCodspeedRunnerMode();

      const config: ViteUserConfig = {
        test: {
          pool: "forks",
          poolOptions: {
            forks: {
              execArgv: getV8Flags(),
            },
          },
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
  if (!Measurement.isInstrumented()) {
    console.warn("[CodSpeed] No instrumentation found, using default mongoUrl");

    return { remoteAddr: body.mongoUrl };
  }

  return await mongoMeasurement.setupInstruments(body);
}
