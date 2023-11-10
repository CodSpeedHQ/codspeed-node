import { defineConfig } from "rollup";
import { declarationsPlugin, jsPlugins } from "../../rollup.options";
import pkg from "./package.json" assert { type: "json" };

export default defineConfig([
  {
    input: "src/index.ts",
    // for some reasons, vitest only wants to require the `main` entrypoint
    // but fails when its CJS since it cannot require `vitest/*` modules, as
    // they are ESM only 🤷
    // we can circumvent this by exposing the `main` entrypoint as ESM
    output: { file: pkg.main, format: "es" },
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
    output: { file: "dist/globalSetup.es5.js", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/],
  },
  {
    input: "src/runner.ts",
    output: { file: "dist/runner.es5.js", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/],
  },
]);
