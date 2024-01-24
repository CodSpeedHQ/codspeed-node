import {
  getV8Flags,
  Measurement,
  mongoMeasurement,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
} from "@codspeed/core";
import { join } from "path";
import { Plugin } from "vite";
import { UserConfig } from "vitest/config";

// get this file's directory path from import.meta.url
const __dirname = new URL(".", import.meta.url).pathname;
const isFileInTs = import.meta.url.endsWith(".ts");

function getCodSpeedFileFromName(name: string) {
  const fileExtension = isFileInTs ? "ts" : "mjs";

  return join(__dirname, `${name}.${fileExtension}`);
}

export default function codspeedPlugin(): Plugin {
  return {
    name: "codspeed:vitest",
    apply(_, { mode }) {
      if (mode !== "benchmark") {
        return false;
      }
      if (!Measurement.isInstrumented()) {
        console.warn("[CodSpeed] bench detected but no instrumentation found");
      }
      return true;
    },
    enforce: "post",
    config(): UserConfig {
      return {
        test: {
          pool: "forks",
          poolOptions: {
            forks: {
              execArgv: getV8Flags(),
            },
          },
          runner: getCodSpeedFileFromName("runner"),
          globalSetup: [getCodSpeedFileFromName("globalSetup")],
        },
      };
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
