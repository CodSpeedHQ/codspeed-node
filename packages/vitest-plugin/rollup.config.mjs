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
  // The page half must not pull in anything node-native: keeping `@codspeed/core`
  // out of its externals makes the build fail if it ever does.
  {
    input: "src/browser/bench.ts",
    output: { file: "dist/browser.mjs", format: "es" },
    plugins: jsPlugins(pkg.version),
    external: [/^vitest/],
  },
  {
    input: "src/browser/bench.ts",
    output: { file: "dist/browser.d.ts", format: "es" },
    plugins: declarationsPlugin({
      compilerOptions: { composite: false, preserveSymlinks: false },
    }),
    external: [/^vitest/],
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
    external: ["@codspeed/core", /^vitest/, "tinybench"],
  },
]);
