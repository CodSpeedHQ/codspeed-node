import { findUpSync, Options as FindupOptions } from "find-up";
import { dirname } from "path";

export function getGitDir(path: string): string | undefined {
  const dotGitPath = findUpSync(".git", {
    cwd: path,
    type: "directory",
  } as FindupOptions);
  return dotGitPath ? dirname(dotGitPath) : undefined;
}
