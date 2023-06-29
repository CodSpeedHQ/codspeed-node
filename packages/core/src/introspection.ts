import { writeFileSync } from "fs";

const getV8Flags = (nodeVersionMajor: number) => {
  const flags = [
    "--hash-seed=1",
    "--random-seed=1",
    "--no-opt",
    "--predictable",
    "--predictable-gc-schedule",
    "--interpreted-frames-native-stack",
  ];
  if (nodeVersionMajor < 18) {
    flags.push("--no-randomize-hashes");
  }
  if (nodeVersionMajor < 20) {
    flags.push("--no-scavenge-task");
  }
  return flags;
};

export const tryIntrospect = () => {
  if (process.env.__CODSPEED_NODE_CORE_INTROSPECTION_PATH__ !== undefined) {
    const nodeVersionMajor = parseInt(process.version.slice(1).split(".")[0]);

    const introspectionMetadata = {
      flags: getV8Flags(nodeVersionMajor),
    };
    writeFileSync(
      process.env.__CODSPEED_NODE_CORE_INTROSPECTION_PATH__,
      JSON.stringify(introspectionMetadata)
    );
    process.exit(0);
  }
};
