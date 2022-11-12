import { defineConfig } from "rollup";
import nativePlugin from "rollup-plugin-natives";
import { plugins } from "../../rollup.options";
import pkg from "./package.json" assert { type: "json" };

export default defineConfig({
  input: `src/index.ts`,
  output: [
    {
      file: pkg.main,
      format: "cjs",
      sourcemap: true,
    },
    { file: pkg.module, format: "es", sourcemap: true },
  ],
  external: ["@codspeed/core"],
  watch: {
    include: "src/**",
  },
  plugins: [
    ...plugins,
    nativePlugin({
      copyTo: "dist/lib",
      destDir: "./lib",
    }),
  ],
});
