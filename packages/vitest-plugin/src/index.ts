import { getV8Flags, Measurement } from "@codspeed/core";
import { Plugin } from "vite";
import { UserConfig } from "vitest/config";

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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - vite does not support vitest config yet in typings
    config(): UserConfig {
      return {
        test: {
          pool: "forks",
          poolOptions: {
            forks: {
              execArgv: getV8Flags(),
            },
          },
          runner: `${__dirname}/runner.es5.js`,
          globalSetup: [`${__dirname}/globalSetup.es5.js`],
        },
      };
    },
  };
}
