import { getV8Flags, Measurement } from "@codspeed/core";
import { ConfigEnv, defineConfig, UserConfig } from "vitest/config";

type VitestConfig = ReturnType<typeof defineConfig>;

function applyCodSpeedConfig(config: UserConfig): UserConfig {
  // TODO: prevent opting out of `pool: 'forks'` and/or using `poolOptions.forks.singleFork`
  return {
    ...config,
    test: {
      ...config.test,
      pool: "forks",
      poolOptions: {
        forks: {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - remove when https://github.com/vitest-dev/vitest/pull/4383 is merged and released
          execArgv: getV8Flags(),
        },
      },
      runner: `${__dirname}/runner.es5.js`,
      globalSetup: [
        ...(config.test?.globalSetup ?? []),
        `${__dirname}/globalSetup.es5.js`,
      ],
    },
  };
}

export async function withCodSpeed(
  config: VitestConfig
): Promise<VitestConfig> {
  const isConfigFunction = typeof config === "function";

  return async (env: ConfigEnv) => {
    const awaitedConfig = isConfigFunction ? await config(env) : await config;

    if (env.mode !== "benchmark") {
      return awaitedConfig;
    }
    if (!Measurement.isInstrumented()) {
      console.warn(
        `[CodSpeed] bench detected but no instrumentation found, falling back to default vitest runner`
      );
      return awaitedConfig;
    }

    return applyCodSpeedConfig(awaitedConfig);
  };
}
