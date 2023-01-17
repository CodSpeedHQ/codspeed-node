import measurement from "@codspeed/core";
import { get as getStackTrace } from "stack-trace";
import path, { dirname } from "path";
import { findUpSync, Options } from "find-up";
import { Bench } from "tinybench";

export function withCodSpeed(bench: Bench): Bench {
  if (!measurement.isInstrumented()) {
    return bench;
  }
  const callingFile = getCallingFile();
  bench.run = async () => {
    for (const task of bench.tasks) {
      const uri = callingFile + "::" + task.name;
      measurement.startInstrumentation();
      await task.fn();
      measurement.stopInstrumentation(uri);
    }
    return bench.tasks;
  };
  return bench;
}

function getCallingFile(): string {
  const stack = getStackTrace();
  const callingFile = stack[2].getFileName(); // [here, withCodSpeed, actual caller]
  const gitDir = getGitDir(callingFile);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  return path.relative(gitDir, callingFile);
}

function getGitDir(path: string): string | undefined {
  const dotGitPath = findUpSync(".git", {
    cwd: path,
    type: "directory",
  } as Options);
  return dotGitPath ? dirname(dotGitPath) : undefined;
}
