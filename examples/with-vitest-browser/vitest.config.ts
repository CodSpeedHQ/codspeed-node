import codspeedPlugin, { codspeedLaunchOptions } from "@codspeed/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// React picks its development branch off `process.env.NODE_ENV`, and the
// dependency pre-bundle is built before the `define` plugin runs, so the
// optimizer has to be told about it too. Without this the profile is dominated
// by React's development-only bookkeeping.
const productionDefine = {
  "process.env.NODE_ENV": JSON.stringify("production"),
};

export default defineConfig({
  plugins: [codspeedPlugin()],
  define: productionDefine,
  optimizeDeps: {
    rolldownOptions: { transform: { define: productionDefine } },
    // Pre-bundle everything the benchmark imports up front: a dependency
    // discovered mid-run reloads the page in the middle of a measurement.
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  },
  resolve: { conditions: ["module", "browser", "production"] },
  // Compile JSX against the production runtime: the development one carries
  // source locations no benchmark needs.
  oxc: { jsx: { runtime: "automatic", development: false } },
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: codspeedLaunchOptions() }),
      instances: [{ browser: "chromium" }],
    },
  },
});
