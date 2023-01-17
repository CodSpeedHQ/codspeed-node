import { initCore, measurement, optimizeFunction } from "@codspeed/core";
import { findUpSync, Options } from "find-up";
import path, { dirname } from "path";
import { get as getStackTrace } from "stack-trace";
import { Bench } from "tinybench";

declare const __VERSION__: string;

export function withCodSpeed(bench: Bench): Bench {
  if (!measurement.isInstrumented()) {
    const rawRun = bench.run;
    bench.run = async () => {
      console.warn(
        `[CodSpeed] ${bench.tasks.length} benches detected but no instrumentation found, falling back to tinybench`
      );
      return await rawRun.bind(bench)();
    };
    return bench;
  }
  initCore();
  const callingFile = getCallingFile();
  bench.run = async () => {
    console.log(`[CodSpeed] running with @codspeed/tinybench v${__VERSION__}`);
    for (const task of bench.tasks) {
      const uri = callingFile + "::" + task.name;
      await optimizeFunction(task.fn);
      measurement.startInstrumentation();
      await task.fn();
      measurement.stopInstrumentation(uri);
      console.log(`    ✔ Measured ${uri}`);
    }
    console.log(`[CodSpeed] Done running ${bench.tasks.length} benches.`);
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
