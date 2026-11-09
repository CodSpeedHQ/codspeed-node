import { spawn } from "child_process";
import { once } from "events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const FIXTURE_DIR = fileURLToPath(
  new URL("../../tests/fixtures/analysis", import.meta.url),
);
const VITEST_BIN = join(
  dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
  "vitest.mjs",
);
const RUN_TIMEOUT_MS = 180_000;

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "codspeed-analysis-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("simulation", () => {
  it(
    "awaits a function that returns a promise before its afterEach hook",
    async () => {
      const logFile = join(tmpDir, "events.log");
      writeFileSync(logFile, "");
      // Not spawnSync: blocking this worker times out its calls to Vitest.
      const child = spawn(process.execPath, [VITEST_BIN, "bench", "--run"], {
        cwd: FIXTURE_DIR,
        env: {
          ...process.env,
          CODSPEED_ENV: "true",
          CODSPEED_RUNNER_MODE: "simulation",
          CODSPEED_PROFILE_FOLDER: join(tmpDir, "profile"),
          ANALYSIS_LOG_FILE: logFile,
        },
        timeout: RUN_TIMEOUT_MS,
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr?.on("data", (chunk) => (stderr += chunk));
      const [status] = (await once(child, "close")) as [number | null];

      expect(status, stderr).toBe(0);
      // Every call, the measured one included, finishes its work in between
      // its own hooks.
      const events = readFileSync(logFile, "utf8").trim().split("\n");
      expect(events.join(" ")).toMatch(
        /^beforeEach done afterEach( beforeEach done afterEach)*$/,
      );
    },
    RUN_TIMEOUT_MS,
  );
});
