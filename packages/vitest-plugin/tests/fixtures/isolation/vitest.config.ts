import { defineConfig } from "vitest/config";
import codspeedPlugin from "../../../dist/index.mjs";

const pluginForks = process.env.ISOLATION_FIXTURE_PLUGIN_FORKS;

export default defineConfig({
  plugins: [codspeedPlugin(pluginForks ? { forks: Number(pluginForks) } : {})],
  define: {
    __VERSION__: JSON.stringify("1.0.0"),
  },
  test: {
    include: ["**/*.bench.ts"],
  },
});
