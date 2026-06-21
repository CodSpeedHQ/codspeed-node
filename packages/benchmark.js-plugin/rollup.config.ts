import { createRequire } from "node:module";
import { defineConfig } from "rollup";
import { declarationsPlugin, jsPlugins } from "../../rollup.options";

const pkg = createRequire(import.meta.url)("./package.json");

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
    external: ["@codspeed/core"],
  },
]);
