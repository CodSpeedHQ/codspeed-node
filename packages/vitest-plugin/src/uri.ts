import { getGitDir } from "@codspeed/core";
import path from "path";

/**
 * Build the URI of a benchmark: the git-relative path of the file it is
 * declared in, followed by its suite/test path, `::`-separated (e.g.
 * `src/a.bench.ts::my suite::my test`). `fullTestName` uses `" > "` between
 * suite levels, as Vitest reports it.
 */
export function buildBenchmarkUri(
  filepath: string,
  fullTestName: string,
): string {
  const gitDir = getGitDir(filepath);
  if (gitDir === undefined) {
    throw new Error("Could not find a git repository");
  }
  const relativeFile = path.relative(gitDir, filepath);
  const testPath = fullTestName.split(" > ").join("::");
  return [relativeFile, testPath].filter(Boolean).join("::");
}
