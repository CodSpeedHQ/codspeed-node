import { defineConfig } from "rollup";
import { declarationsPlugin, jsPlugins } from "../../rollup.options.mjs";
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
    onwarn(warning, warn) {
      // The optimization helpers reach V8 natives syntax
      // (%OptimizeFunctionOnNextCall), which has no non-eval entry point.
      if (warning.code === "EVAL" && warning.id?.endsWith("optimization.ts")) {
        return;
      }
      warn(warning);
    },
  },
]);
