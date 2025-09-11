import { writeFileSync } from "fs";
import { getCodspeedRunnerMode } from ".";

const CUSTOM_INTROSPECTION_EXIT_CODE = 0;

export const getV8Flags = () => {
  const nodeVersionMajor = parseInt(process.version.slice(1).split(".")[0]);
  const codspeedRunnerMode = getCodspeedRunnerMode();

  const flags = ["--interpreted-frames-native-stack", "--allow-natives-syntax"];

  if (codspeedRunnerMode === "instrumented") {
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
      ]
    );
    if (nodeVersionMajor < 18) {
      flags.push("--no-randomize-hashes");
    }
    if (nodeVersionMajor < 20) {
      flags.push("--no-scavenge-task");
    }
  }

  if (codspeedRunnerMode === "walltime") {
    flags.push(...["--perf-prof", "--perf-prof-unwinding-info"]);
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
      JSON.stringify(introspectionMetadata)
    );
    process.exit(CUSTOM_INTROSPECTION_EXIT_CODE);
  }
};

export const checkV8Flags = () => {
  const requiredFlags = getV8Flags();
  const actualFlags = process.execArgv;
  const missingFlags = requiredFlags.filter(
    (flag) => !actualFlags.includes(flag)
  );
  if (missingFlags.length > 0) {
    console.warn(
      `[CodSpeed] missing required flags: ${missingFlags.join(", ")}`
    );
  }
};
