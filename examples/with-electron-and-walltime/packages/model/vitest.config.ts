import codspeedPlugin from "@codspeed/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    include: ["bench/**/*.bench.ts"],
    benchmark: {
      include: ["bench/**/*.bench.ts"],
    },
  },
});
