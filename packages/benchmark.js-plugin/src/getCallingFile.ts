import { findUpSync, Options as FindupOptions } from "find-up";
import path, { dirname } from "path";
import { get as getStackTrace } from "stack-trace";
import { fileURLToPath } from "url";

function getGitDir(path: string): string | undefined {
  const dotGitPath = findUpSync(".git", {
    cwd: path,
    type: "directory",
  } as FindupOptions);
  return dotGitPath ? dirname(dotGitPath) : undefined;
}

export default function getCallingFile(depth: number): string {
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
