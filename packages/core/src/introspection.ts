import { readlinkSync, writeFileSync } from "fs";
import path from "path";
import { isMainThread } from "worker_threads";

import native_core from "./native_core";
import { getCodspeedRunnerMode, getInstrumentMode } from "./runnerMode";

const CUSTOM_INTROSPECTION_EXIT_CODE = 0;

const V8_LOG_FILENAME_PATTERN = "codspeed-v8-%p.log";
const RESTARTED_PID_ENV = "__CODSPEED_NODE_CORE_RESTARTED_PID__";

// Fixed seeds so Math.random() and hash table layout match on every run
const getSeedFlags = (nodeVersionMajor: number) => {
  const flags = ["--hash-seed=1", "--random-seed=1"];
  if (nodeVersionMajor < 18) {
    flags.push("--no-randomize-hashes");
  }
  return flags;
};

export const getV8Flags = () => {
  const nodeVersionMajor = parseInt(process.version.slice(1).split(".")[0]);
  const instrumentMode = getInstrumentMode();

  const flags = ["--interpreted-frames-native-stack", "--allow-natives-syntax"];

  switch (instrumentMode) {
    case "analysis": {
      flags.push(
        ...[
          ...getSeedFlags(nodeVersionMajor),
          "--no-opt",
          "--always-sparkplug",
          "--predictable",
          "--predictable-gc-schedule",
          "--expose-gc",
          "--no-concurrent-sweeping",
          "--max-old-space-size=4096",
        ],
      );
      if (nodeVersionMajor < 20) {
        flags.push("--no-scavenge-task");
      } else {
        // V8 11.3 renamed --scavenge-task to --minor-gc-task
        flags.push("--no-minor-gc-task");
      }
      if (nodeVersionMajor >= 24) {
        // --no-opt is only an alias for --no-turbofan. Maglev is compiled out of
        // Node < 24 but enabled by default from V8 13.6 on, where it keeps
        // tiering up hot functions and cuts their instruction count ~4x.
        flags.push("--no-maglev");
      }

      break;
    }

    case "walltime": {
      flags.push(...getSeedFlags(nodeVersionMajor));

      // Emit the V8 jitdump
      flags.push("--perf-prof");

      const v8LogDir = process.env.CODSPEED_V8_LOG;
      if (v8LogDir) {
        flags.push(
          ...[
            "--log-code",
            "--no-log-source-code",
            "--no-logfile-per-isolate",
            `--logfile=${path.join(v8LogDir, V8_LOG_FILENAME_PATTERN)}`,
          ],
        );
      } else {
        // Just output the perf.map
        flags.push("--perf-basic-prof");
      }
    }
  }

  return flags;
};

export const tryIntrospect = () => {
  if (process.env.__CODSPEED_NODE_CORE_INTROSPECTION_PATH__ !== undefined) {
    const introspectionMetadata = {
      flags: getV8Flags(),
    };
    writeFileSync(
      process.env.__CODSPEED_NODE_CORE_INTROSPECTION_PATH__,
      JSON.stringify(introspectionMetadata),
    );
    process.exit(CUSTOM_INTROSPECTION_EXIT_CODE);
  }
};

/**
 * Restarts the process with the V8 flags the runner mode requires when the
 * launcher did not pass them (e.g. Bazel executes node by absolute path, so the
 * runner's `node` wrapper never runs). Must be called before instrument-hooks
 * is used: the restart replaces this process.
 *
 * Cases that cannot restart safely, including a failed exec, run without the
 * flags; `checkV8Flags` warns once instrument-hooks is set up.
 */
export const ensureV8Flags = () => {
  if (getCodspeedRunnerMode() === "disabled" || !native_core.isBound) {
    return;
  }

  const missingFlags = getV8Flags().filter(
    (flag) => !process.execArgv.includes(flag),
  );
  if (missingFlags.length === 0) {
    return;
  }

  // Worker threads and IPC children cannot replace their process, and an IPC
  // channel would be lost.
  if (!isMainThread || process.send !== undefined) {
    return;
  }

  // The restart did not help (its launcher stripped the flags again): do not
  // restart in a loop.
  if (process.env[RESTARTED_PID_ENV] === String(process.pid)) {
    return;
  }

  const getExecutable = () => {
    switch (process.platform) {
      case "linux":
        // rules_js replaces process.execPath with its shell shim.
        return readlinkSync("/proc/self/exe");
      case "darwin":
        return process.execPath;
      default:
        return undefined;
    }
  };

  try {
    const executable = getExecutable();
    if (executable === undefined) {
      return;
    }

    process.env[RESTARTED_PID_ENV] = String(process.pid);
    // The runner's wrapper passes its flags before the user's, so user flags win.
    native_core.restart(executable, [
      executable,
      ...missingFlags,
      ...process.execArgv,
      ...process.argv.slice(1),
    ]);
  } catch (error) {
    // No /proc, or exec failed: the current image is still usable, so measure
    // without the flags and let checkV8Flags warn.
    delete process.env[RESTARTED_PID_ENV];
    console.warn(
      `[CodSpeed] failed to restart node with the required V8 flags: ${String(error)}`,
    );
  }
};

export const checkV8Flags = () => {
  const requiredFlags = getV8Flags();
  const actualFlags = process.execArgv;
  const missingFlags = requiredFlags.filter(
    (flag) => !actualFlags.includes(flag),
  );
  if (missingFlags.length > 0) {
    console.warn(
      `[CodSpeed] missing required flags: ${missingFlags.join(", ")}`,
    );
  }
};
