import { defineConfig } from "rollup";
import { declarationsPlugin, jsPlugins } from "../../rollup.options.mjs";
import pkg from "./package.json" with { type: "json" };

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
    plugins: declarationsPlugin({
      compilerOptions: { composite: false, preserveSymlinks: false },
    }),
    external: ["vite"],
  },
  {
    input: "src/globalSetup.ts",
    output: { file: "dist/globalSetup.mjs", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/],
  },
  // Vitest imports these by file path (as `test.runner` or `benchmark.provider`), so
  // each needs its own output; `resolveFile` expects it at the same path as in `src/`.
  {
    input: "src/legacy/analysis.ts",
    output: { file: "dist/legacy/analysis.mjs", format: "es" },
    // top-level await
    plugins: jsPlugins(pkg.version, "es2022"),
    external: ["@codspeed/core", /^vitest/],
  },
  {
    input: "src/legacy/walltime.ts",
    output: { file: "dist/legacy/walltime.mjs", format: "es" },
    // top-level await
    plugins: jsPlugins(pkg.version, "es2022"),
    external: ["@codspeed/core", /^vitest/],
  },
  {
    input: "src/v5/provider.ts",
    output: { file: "dist/v5/provider.mjs", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/],
  },
]);
