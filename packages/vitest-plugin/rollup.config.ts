import { defineConfig } from "rollup";
import { declarationsPlugin, jsPlugins } from "../../rollup.options";
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
    plugins: declarationsPlugin({ compilerOptions: { composite: false } }),
  },
  {
    input: "src/globalSetup.ts",
    output: { file: "dist/globalSetup.mjs", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/],
  },
  // The built layout mirrors the source layout (dist/legacy/*, dist/v5/*) so the
  // plugin resolves the seam files with one path rule in both dev and prod.
  {
    input: "src/legacy/analysis.ts",
    output: { file: "dist/legacy/analysis.mjs", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/],
  },
  {
    input: "src/legacy/walltime.ts",
    output: { file: "dist/legacy/walltime.mjs", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/],
  },
  {
    input: "src/v5/setup.ts",
    output: { file: "dist/v5/setup.mjs", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: ["@codspeed/core", /^vitest/, "tinybench"],
  },
]);
