import { defineConfig } from "vitest/config";
import codspeedPlugin from "./dist/index.mjs";

export default defineConfig({
  // @ts-expect-error - TODO: investigate why importing from '.' wants to import only "main" field and thus fail
  plugins: [codspeedPlugin()],
  define: {
    __VERSION__: JSON.stringify("1.0.0"),
  },
  test: {
    // Setting `exclude` drops vitest's defaults, and the linked workspace
    // packages under node_modules resolve to sibling source trees that carry
    // their own tests.
    exclude: [
      "**/node_modules/**",
      "../**",
      "**/tests/**/*",
      "**/.rollup.cache/**/*",
    ],
    mockReset: true,
  },
});
