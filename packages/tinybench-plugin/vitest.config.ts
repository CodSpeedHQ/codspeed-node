import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify("1.0.0"),
  },
  test: {
    exclude: ["**/node_modules/**", "**/.rollup.cache/**"],
    mockReset: true,
  },
});
