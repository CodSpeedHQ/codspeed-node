import { defineConfig } from "rollup";
import { declarationsPlugin, jsPlugins } from "../../rollup.options";
import pkg from "./package.json" with { type: "json" };

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
    plugins: declarationsPlugin({ compilerOptions: { composite: false } }),
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
    plugins: jsPlugins(pkg.version),
  },
]);
