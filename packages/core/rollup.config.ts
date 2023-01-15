import { defineConfig } from "rollup";
import nativePlugin from "rollup-plugin-natives";
import { declarationsPlugin, jsPlugins } from "../../rollup.options";

import pkg from "./package.json" assert { type: "json" };

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
    plugins: [
      ...jsPlugins,
      nativePlugin({
        copyTo: "dist/lib",
        destDir: "./lib",
      }),
    ],
  },
]);
