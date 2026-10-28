import {
  getGitDir,
  getInstrumentMode,
  getV8Flags,
  InstrumentHooks,
  ISOLATED_BENCHMARK_ENV,
  mongoMeasurement,
  recordIsolationCommand,
  SetupInstrumentsRequestBody,
  SetupInstrumentsResponse,
} from "@codspeed/core";
import { join } from "path";
import { Plugin } from "vite";
import { type ViteUserConfig } from "vitest/config";
import { resolveVitestBackend } from "./vitestBackend";

// get this file's directory path from import.meta.url
const __dirname = new URL(".", import.meta.url).pathname;
const isFileInTs = import.meta.url.endsWith(".ts");

// `src/` and `dist/` share the same layout (see rollup.config.mjs).
function resolveFile(name: string): string {
  const fileExtension = isFileInTs ? "ts" : "mjs";
  return join(__dirname, `${name}.${fileExtension}`);
}

export default function codspeedPlugin(): Plugin {
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
      // Vitest measures in forked workers, whose argv is not the command that
      // starts the benchmarks. Record the command of this main process so the
      // workers can run it again for each benchmark. Workers inherit the env.
      recordIsolationCommand();
      const uri = process.env[ISOLATED_BENCHMARK_ENV];
      if (uri !== undefined) {
        const gitDir = getGitDir(userConfig.root ?? process.cwd());
        if (gitDir === undefined) {
          throw new Error("Could not find a git repository");
        }
        // Replace rather than merge include globs: isolated children must not
        // transform and import unrelated benchmark files.
        const file = join(gitDir, uri.split("::")[0])
          .replace(/\\/g, "/")
          .replace(/[\\*?{}()[\]!+@]/g, "\\$&");
        userConfig.test ??= {};
        userConfig.test.benchmark ??= {};
        userConfig.test.benchmark.include = [file];
      }
      return {
        test: {
          pool: "forks",
          globalSetup: [resolveFile("globalSetup")],
          ...resolveVitestBackend().getBenchmarkTestConfig(
            getV8Flags(),
            resolveFile,
            userConfig.test,
          ),
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
