import { execFileSync } from "child_process";
import fs from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";

import { findTsxPreload, getTsxPackageDir } from "../src/tsx";

const FIXTURES_DIR = path.join(__dirname, "fixtures", "tsx");
const TSX_LOADER = path.join(__dirname, "..", "dist", "tsx-loader.cjs");
const TSX_PACKAGE_JSON = require.resolve("tsx/package.json");

const runNode = (args: string[], env: NodeJS.ProcessEnv = {}) =>
  execFileSync(process.execPath, args, {
    cwd: FIXTURES_DIR,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 60_000,
  });

describe("findTsxPreload", () => {
  it.each([
    [["--import", "tsx"], "tsx"],
    [["--import=tsx/esm"], "tsx/esm"],
    [["-r", "tsx/cjs"], "tsx/cjs"],
    [
      [
        "--require",
        "/app/node_modules/tsx/dist/preflight.cjs",
        "--import",
        "file:///app/node_modules/tsx/dist/loader.mjs",
      ],
      "/app/node_modules/tsx/dist/preflight.cjs",
    ],
  ])("finds tsx in %j", (execArgv, expected) => {
    expect(findTsxPreload(execArgv)).toBe(expected);
  });

  it.each([
    [["--import", "./setup.ts"]],
    [["--import=file:///app/node_modules/tsx-plugin/index.js"]],
    [["--max-old-space-size=4096"]],
  ])("ignores %j", (execArgv) => {
    expect(findTsxPreload(execArgv)).toBeUndefined();
  });
});

describe("getTsxPackageDir", () => {
  it("returns the tsx package of a preloaded file", () => {
    expect(
      getTsxPackageDir(
        "file:///app/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/loader.mjs",
      ),
    ).toBe("/app/node_modules/.pnpm/tsx@4.23.12/node_modules/tsx");
  });
});

describe("tsx loader", () => {
  it.each(["names.cts", "names.mts"])(
    "transforms %s without keepNames and minifyWhitespace",
    (fixture) => {
      const output = runNode([
        `--require=${TSX_LOADER}`,
        "--import",
        "tsx",
        fixture,
      ]);

      expect(output).not.toContain("__name");
      expect(output).toContain("const increment = (n) => n + 1;\n");
    },
  );

  it("starts esbuild's service without --ping", () => {
    const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "codspeed-esbuild-"));
    const argsFile = path.join(stubDir, "args");
    const esbuild = createRequire(TSX_PACKAGE_JSON).resolve(
      "esbuild/bin/esbuild",
    );
    // esbuild's bin script reads ESBUILD_BINARY_PATH too, and would run the stub again
    const stub = path.join(stubDir, "esbuild");
    fs.writeFileSync(
      stub,
      `#!/bin/sh\necho "$@" >> "${argsFile}"\nunset ESBUILD_BINARY_PATH\nexec "${esbuild}" "$@"\n`,
      { mode: 0o755 },
    );

    let calls: string[];
    try {
      for (const fixture of ["names.cts", "names.mts"]) {
        runNode([`--require=${TSX_LOADER}`, "--import", "tsx", fixture], {
          ESBUILD_BINARY_PATH: stub,
        });
      }
      calls = fs.readFileSync(argsFile, "utf8").trim().split("\n");
    } finally {
      fs.rmSync(stubDir, { recursive: true });
    }

    expect(calls.some((call) => call.includes("--service="))).toBe(true);
    expect(calls.filter((call) => call.includes("--ping"))).toEqual([]);
  });
});

describe("tsx CLI", () => {
  it("reruns the script with the node flags CodSpeed needs", () => {
    const tsxCli = path.join(path.dirname(TSX_PACKAGE_JSON), "dist", "cli.mjs");

    const output = runNode([tsxCli, "introspect.mts"], {
      CODSPEED_ENV: "true",
      CODSPEED_RUNNER_MODE: "simulation",
    });

    const execArgvs = output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    expect(execArgvs).toHaveLength(1);
    expect(execArgvs[0]).toEqual(
      expect.arrayContaining(["--no-opt", `--require=${TSX_LOADER}`]),
    );
  });
});
