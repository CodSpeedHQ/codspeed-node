import { writeFileSync } from "fs";
import path from "path";

import { getInstrumentMode } from "./runnerMode";

const CUSTOM_INTROSPECTION_EXIT_CODE = 0;

const V8_LOG_FILENAME_PATTERN = "codspeed-v8-%p.log";

export const getV8Flags = () => {
  const nodeVersionMajor = parseInt(process.version.slice(1).split(".")[0]);
  const instrumentMode = getInstrumentMode();

  const flags = ["--interpreted-frames-native-stack", "--allow-natives-syntax"];

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
