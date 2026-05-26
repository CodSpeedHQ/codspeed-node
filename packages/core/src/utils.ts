import { Options as FindupOptions, findUpSync } from "find-up";
import path, { dirname } from "path";
import { get as getStackTrace } from "stack-trace";
import { fileURLToPath } from "url";

export function getGitDir(path: string): string | undefined {
  const dotGitPath = findUpSync(".git", {
    cwd: path,
    type: "directory",
  } as FindupOptions);
  return dotGitPath ? dirname(dotGitPath) : undefined;
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
  const gitDir = getGitDir(callingFile);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  if (callingFile.startsWith("file://")) {
    callingFile = fileURLToPath(callingFile);
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
