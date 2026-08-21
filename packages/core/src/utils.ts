import { existsSync, statSync } from "fs";
import path, { dirname, join } from "path";
import { get as getStackTrace } from "stack-trace";
import { fileURLToPath } from "url";

export function getGitDir(fromPath: string): string | undefined {
  let dir = statSync(fromPath, { throwIfNoEntry: false })?.isDirectory()
    ? fromPath
    : dirname(fromPath);
  for (;;) {
    // `.git` is a directory in a normal clone and a file in a worktree or submodule.
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Return the file that called the function this is invoked from, expressed as
 * a path relative to the enclosing git repository root.
 *
 * The `depth` parameter is the number of stack frames to skip past
 * `getCallingFile` itself. Pass `0` to get the file of the function that
 * called `getCallingFile`, `1` to skip one further frame (for indirection
 * through a helper), and so on.
 */
export function getCallingFile(depth: number): string {
  const stack = getStackTrace();
  let callingFile = stack[depth + 1].getFileName();
  if (callingFile.startsWith("file://")) {
    callingFile = fileURLToPath(callingFile);
  }
  const gitDir = getGitDir(callingFile);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  return path.relative(gitDir, callingFile);
}

/**
 * Log debug messages if the environment variable `CODSPEED_DEBUG` is set.
 */
export function logDebug(...args: unknown[]) {
  if (process.env.CODSPEED_DEBUG) {
    console.log(...args);
  }
}
