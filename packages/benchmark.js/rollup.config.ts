import { defineConfig } from "rollup";
import pkg from "./package.json" assert { type: "json" };
import { declarationsPlugin, jsPlugins } from "../../rollup.options";

const entrypoint = "src/index.ts";

export default defineConfig([
  {
    input: entrypoint,
    output: [
      {
        file: pkg.types,
        format: "es",
        sourcemap: true,
      },
    ],
    plugins: declarationsPlugin,
    external: ["@codspeed/core"],
  },
  {
    input: entrypoint,
    output: [
      {
        file: pkg.main,
        format: "cjs",
        sourcemap: true,
      },
      { file: pkg.module, format: "es", sourcemap: true },
    ],
    plugins: [...jsPlugins],
    external: ["@codspeed/core"],
  },
]);
