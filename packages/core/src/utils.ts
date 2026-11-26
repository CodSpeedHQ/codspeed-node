import { existsSync } from "fs";
import path from "path";
import { get as getStackTrace } from "stack-trace";
import { fileURLToPath } from "url";

/**
 * Return the root of the git repository containing `from`. `.git` is a
 * directory in a regular clone and a file in worktrees and submodules.
 */
export function getGitDir(from: string): string | undefined {
  let dir = path.resolve(from);
  while (!existsSync(path.join(dir, ".git"))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
  return dir;
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
  return getGitRelativePath(stack[depth + 1].getFileName());
}

/**
 * Returns `fileName`, a path or a `file://` URL (ES modules), relative to the
 * root of the git repository that contains it.
 *
 * It throws when the file is in no git repository.
 */
export function getGitRelativePath(fileName: string): string {
  // Converts the URL first: as a path, a URL resolves against the current
  // directory, so the search would find the repository of the current
  // directory instead of the one of the file.
  const filePath = fileName.startsWith("file://")
    ? fileURLToPath(fileName)
    : fileName;
  const gitDir = getGitDir(filePath);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  return path.relative(gitDir, filePath);
}

/**
 * Log debug messages if the environment variable `CODSPEED_DEBUG` is set.
 */
export function logDebug(...args: unknown[]) {
  if (process.env.CODSPEED_DEBUG) {
    console.log(...args);
  }
}
