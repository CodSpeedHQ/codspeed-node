import { createRequire } from "module";
import { defineConfig } from "vitest/config";
import codspeedPlugin from "./dist/index.mjs";

// The legacy runner tests exercise the Vitest 3/4 benchmark backend
// (`vitest/suite`, `NodeBenchmarkRunner`), which Vitest 5 removed. Exclude them
// when running under v5+ so the file's static imports don't fail to resolve.
const require = createRequire(import.meta.url);
const vitestMajor = parseInt(
  (require("vitest/package.json").version as string).split(".")[0],
  10,
);
const legacyOnlyTests =
  vitestMajor >= 5 ? ["**/__tests__/instrumented.test.ts"] : [];

export default defineConfig({
  // @ts-expect-error - TODO: investigate why importing from '.' wants to import only "main" field and thus fail
  plugins: [codspeedPlugin()],
  define: {
    __VERSION__: JSON.stringify("1.0.0"),
  },
  test: {
    exclude: ["**/tests/**/*", "**/.rollup.cache/**/*", ...legacyOnlyTests],
    mockReset: true,
  },
});
