import { defineConfig } from "rollup";
import { declarationsPlugin, jsPlugins } from "../../rollup.options";
import pkg from "./package.json" assert { type: "json" };

export default defineConfig([
  {
    input: "src/index.ts",
    output: { file: pkg.module, format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/],
  },
  {
    input: "src/index.ts",
    output: { file: pkg.types, format: "es" },
    plugins: declarationsPlugin({ compilerOptions: { composite: false } }),
  },
  {
    input: "src/globalSetup.ts",
    output: { file: "dist/globalSetup.mjs", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/],
  },
  {
    input: "src/instrumented.ts",
    output: { file: "dist/instrumented.mjs", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/],
  },
  {
    input: "src/walltime/index.ts",
    output: { file: "dist/walltime.mjs", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/],
  },
]);
