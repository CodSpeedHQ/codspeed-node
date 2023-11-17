import { findUpSync, Options as FindupOptions } from "find-up";
import { dirname } from "path";

export function getGitDir(path: string): string | undefined {
  const dotGitPath = findUpSync(".git", {
    cwd: path,
    type: "directory",
  } as FindupOptions);
  return dotGitPath ? dirname(dotGitPath) : undefined;
}

/**
 * Log debug messages if the environment variable `CODSPEED_DEBUG` is set.
 */
export function logDebug(...args: unknown[]) {
  if (process.env.CODSPEED_DEBUG) {
    console.log(...args);
  }
}
