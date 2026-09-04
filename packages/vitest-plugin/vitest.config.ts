import { defineConfig } from "vitest/config";
import codspeedPlugin from "./dist/index.mjs";

export default defineConfig({
  // @ts-expect-error - TODO: investigate why importing from '.' wants to import only "main" field and thus fail
  plugins: [codspeedPlugin()],
  define: {
    __VERSION__: JSON.stringify("1.0.0"),
  },
  test: {
    exclude: ["**/tests/**/*", "**/.rollup.cache/**/*"],
    mockReset: true,
  },
});
