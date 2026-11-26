/* eslint-disable @typescript-eslint/no-require-imports */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export {}; // Make this a module

enum ScriptEntry {
  File,
  Stdin,
  Eval,
}

interface BenchmarkProcess {
  spawnedPid: number | undefined;
  pid: number;
  execArgv: string[];
  stderr: string;
}

const runBenchmarkProcess = (
  env: NodeJS.ProcessEnv,
  nodeArgs: string[] = [],
  prelude = "",
  entry = ScriptEntry.File,
): BenchmarkProcess => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codspeed-ensure-v8-"));
  const script = path.join(dir, "bench.js");
  fs.writeFileSync(
    script,
    `${prelude}
const core = require(${JSON.stringify(require.resolve(".."))});
core.ensureV8Flags();
process.stdout.write(
  JSON.stringify({ pid: process.pid, execArgv: process.execArgv }),
);
`,
  );
  try {
    const baseEnv = { ...process.env };
    delete baseEnv.CODSPEED_ENV;
    delete baseEnv.CODSPEED_RUNNER_MODE;
    const entryArgs = {
      [ScriptEntry.File]: [script],
      [ScriptEntry.Stdin]: ["-"],
      [ScriptEntry.Eval]: ["-e", `require(${JSON.stringify(script)})`],
    }[entry];
    const result = spawnSync(process.execPath, [...nodeArgs, ...entryArgs], {
      env: { ...baseEnv, ...env },
      encoding: "utf8",
      input: entry === ScriptEntry.Stdin ? fs.readFileSync(script) : undefined,
    });
    if (result.status !== 0) {
      throw new Error(`child failed: ${result.stderr}`);
    }
    return {
      spawnedPid: result.pid,
      stderr: result.stderr,
      ...(JSON.parse(result.stdout) as { pid: number; execArgv: string[] }),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe("ensureV8Flags", () => {
  it("restarts the process with the required flags when they are missing", () => {
    const { spawnedPid, pid, execArgv } = runBenchmarkProcess({
      CODSPEED_ENV: "runner",
      CODSPEED_RUNNER_MODE: "instrumentation",
    });

    // Same pid: the process was replaced, not started as a child.
    expect(pid).toBe(spawnedPid);
    expect(execArgv.filter((flag) => flag === "--no-opt")).toHaveLength(1);
    expect(execArgv).toContain("--predictable");
  });

  it("restarts a process started with -e", () => {
    const { spawnedPid, pid, execArgv } = runBenchmarkProcess(
      { CODSPEED_ENV: "runner", CODSPEED_RUNNER_MODE: "instrumentation" },
      [],
      "",
      ScriptEntry.Eval,
    );

    expect(pid).toBe(spawnedPid);
    expect(execArgv).toContain("--no-opt");
  });

  it("keeps a process that read its script from stdin", () => {
    // Parsing the output proves the script ran instead of an empty restart.
    const { spawnedPid, pid, execArgv } = runBenchmarkProcess(
      { CODSPEED_ENV: "runner", CODSPEED_RUNNER_MODE: "instrumentation" },
      [],
      "",
      ScriptEntry.Stdin,
    );

    expect(pid).toBe(spawnedPid);
    expect(execArgv).not.toContain("--no-opt");
  });

  it("adds the flags before the user's so user flags win", () => {
    const { execArgv } = runBenchmarkProcess(
      { CODSPEED_ENV: "runner", CODSPEED_RUNNER_MODE: "instrumentation" },
      ["--max-old-space-size=8192"],
    );

    expect(execArgv.indexOf("--max-old-space-size=4096")).toBeLessThan(
      execArgv.indexOf("--max-old-space-size=8192"),
    );
  });

  it("warns and continues when the restart fails", () => {
    // Unlinking the running executable makes /proc/self/exe point at a path
    // that no longer exists, so execv fails with ENOENT.
    const { execArgv, stderr } = runBenchmarkProcess(
      { CODSPEED_ENV: "runner", CODSPEED_RUNNER_MODE: "instrumentation" },
      [],
      `const fs = require("fs"), path = require("path");
const copy = path.join(__dirname, "node-copy");
if (!process.env.__NODE_COPY_RUNNING__) {
  fs.copyFileSync(process.execPath, copy);
  fs.chmodSync(copy, 0o755);
  const r = require("child_process").spawnSync(copy, process.argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env, __NODE_COPY_RUNNING__: "1" },
  });
  process.exit(r.status ?? 1);
}
fs.unlinkSync(copy);`,
    );

    expect(execArgv).not.toContain("--no-opt");
    expect(stderr).toContain("failed to restart node");
  });

  it("keeps the process when CodSpeed is disabled", () => {
    const { execArgv } = runBenchmarkProcess({
      CODSPEED_RUNNER_MODE: "instrumentation",
    });

    expect(execArgv).not.toContain("--no-opt");
  });
});
