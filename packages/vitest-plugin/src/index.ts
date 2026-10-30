import {
  getInstrumentMode,
  getV8Flags,
  InstrumentHooks,
  mongoMeasurement,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
  type WalltimeOptions,
} from "@codspeed/core";
import { join } from "path";
import { Plugin } from "vite";
import { type ViteUserConfig } from "vitest/config";
import {
  resolveVitestBackend,
  scaleBenchTimeoutToForks,
} from "./vitestBackend";

// get this file's directory path from import.meta.url
const __dirname = new URL(".", import.meta.url).pathname;
const isFileInTs = import.meta.url.endsWith(".ts");

// `src/` and `dist/` share the same layout (see rollup.config.mjs).
function resolveFile(name: string): string {
  const fileExtension = isFileInTs ? "ts" : "mjs";
  return join(__dirname, `${name}.${fileExtension}`);
}

/** `options.forks`: see {@link WalltimeOptions}; isolation requires Vitest 5. */
export default function codspeedPlugin(options: WalltimeOptions = {}): Plugin {
  return {
    name: "codspeed:vitest",
    apply(_, { mode }) {
      if (!resolveVitestBackend().isActive(mode)) {
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
    config(userConfig: ViteUserConfig): ViteUserConfig {
      const backend = resolveVitestBackend();
      backend.configureIsolation(userConfig, options);
      return {
        test: {
          pool: "forks",
          globalSetup: [resolveFile("globalSetup")],
          ...backend.getBenchmarkTestConfig(
            getV8Flags(),
            resolveFile,
            userConfig.test,
          ),
        },
      };
    },
    configureVitest({ project }) {
      scaleBenchTimeoutToForks(project.config, options.forks);
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
