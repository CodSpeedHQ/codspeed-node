import { getV8Flags, Measurement } from "@codspeed/core";
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
        console.warn(
          `[CodSpeed] bench detected but no instrumentation found, falling back to default vitest runner`
        );
        return false;
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
