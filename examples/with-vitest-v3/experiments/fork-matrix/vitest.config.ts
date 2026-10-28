import codspeedPlugin from "@codspeed/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    benchmark: { include: ["experiments/fork-matrix/fork-matrix.bench.ts"] },
    // Ten serial forks per benchmark can outlast the default timeouts.
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
