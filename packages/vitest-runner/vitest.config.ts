import { defineConfig } from "vitest/config";
import { withCodSpeed } from ".";

export default withCodSpeed(
  defineConfig({
    test: {
      exclude: ["**/tests/**/*", "**/.rollup.cache/**/*"],
      mockReset: true,
    },
  })
);
