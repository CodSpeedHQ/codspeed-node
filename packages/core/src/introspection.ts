import { writeFileSync } from "fs";

import { getInstrumentMode } from ".";

const CUSTOM_INTROSPECTION_EXIT_CODE = 0;

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
      }

      break;
    }

    case "walltime": {
      // Emit the V8 jitdump
      flags.push("--perf-prof");
      if (process.env.CODSPEED_V8_LOG !== undefined) {
        flags.push(
          ...[
            // Emit the code+source log carrying the full inlining map for optimized functions
            "--log-code",
            "--no-log-source-code",
            "--no-logfile-per-isolate",
            // TODO: Do not hardcode this
            "--logfile=/tmp/codspeed-v8.log",
          ],
        );
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
