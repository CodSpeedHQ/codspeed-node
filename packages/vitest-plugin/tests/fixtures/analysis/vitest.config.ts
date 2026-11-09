import { defineConfig } from "vitest/config";
import codspeedPlugin from "../../../dist/index.mjs";

export default defineConfig({
  plugins: [codspeedPlugin()],
  define: {
    __VERSION__: JSON.stringify("1.0.0"),
  },
  test: {
    include: ["**/*.bench.ts"],
  },
});
