import { spawnSync } from "child_process";
import { writeFileSync } from "fs";
import os from "os";
import path from "path";
import { isMainThread } from "worker_threads";

import { getCodspeedRunnerMode, getInstrumentMode } from "./runnerMode";
import { findTsxPreload } from "./tsx";

const CUSTOM_INTROSPECTION_EXIT_CODE = 0;

const V8_LOG_FILENAME_PATTERN = "codspeed-v8-%p.log";

export const getV8Flags = () => {
  const nodeVersionMajor = parseInt(process.version.slice(1).split(".")[0]);
  const instrumentMode = getInstrumentMode();

  const flags = ["--interpreted-frames-native-stack", "--allow-natives-syntax"];

  if (findTsxPreload(process.execArgv) !== undefined) {
    // `--require` preloads run before `--import` ones, such as tsx's
    flags.push(`--require=${path.join(__dirname, "tsx-loader.cjs")}`);
  }

  switch (instrumentMode) {
    case "analysis": {
      flags.push(
        ...[
          "--hash-seed=1",
          "--random-seed=1",
          "--no-opt",
          "--predictable",
          "--predictable-gc-schedule",
          "--expose-gc",
          "--no-concurrent-sweeping",
          "--max-old-space-size=4096",
        ],
      );
      if (nodeVersionMajor < 18) {
        flags.push("--no-randomize-hashes");
      }
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

const RERUN_ENV = "__CODSPEED_NODE_CORE_RERUN__";
const WHITESPACE = /\s/;

const rerunWithFlags = (flags: string[]): never => {
  const args = [...flags, ...process.execArgv, ...process.argv.slice(1)];
  // `execve` keeps the pid, `spawnSync` makes it the rerun's parent pid
  const env = { ...process.env, [RERUN_ENV]: String(process.pid) };
  if (process.execve) {
    process.execve(process.execPath, [process.execPath, ...args], env);
  }
  const { status, signal } = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env,
  });
  process.exit(status ?? 128 + os.constants.signals[signal!]);
};

export const tryIntrospect = () => {
  if (process.env.__CODSPEED_NODE_CORE_INTROSPECTION_PATH__ !== undefined) {
    const introspectionMetadata = {
      // The runner splits the flags on whitespace. Under tsx, the rerun below
      // adds back the ones left out.
      flags: getV8Flags().filter((flag) => !WHITESPACE.test(flag)),
    };
    writeFileSync(
      process.env.__CODSPEED_NODE_CORE_INTROSPECTION_PATH__,
      JSON.stringify(introspectionMetadata),
    );
    process.exit(CUSTOM_INTROSPECTION_EXIT_CODE);
  }

  const isRerun = [process.pid, process.ppid]
    .map(String)
    .includes(process.env[RERUN_ENV] ?? "");
  delete process.env[RERUN_ENV];
  // The `tsx` CLI runs the script in a child node process, without the flags
  // given to the CLI's own process. Rerun at most once, so a flag that never
  // shows up in `execArgv` cannot loop, and only a process that can be
  // replaced: not a worker thread, nor one with an IPC channel to its parent.
  const canRerunUnderTsx =
    !isRerun &&
    isMainThread &&
    process.channel === undefined &&
    getCodspeedRunnerMode() !== "disabled" &&
    findTsxPreload(process.execArgv) !== undefined &&
    process.argv[1] !== undefined;
  if (!canRerunUnderTsx) {
    return;
  }
  const flags = getV8Flags();
  if (flags.some((flag) => !process.execArgv.includes(flag))) {
    rerunWithFlags(flags);
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
