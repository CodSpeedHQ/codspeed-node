import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { pathToFileURL } from "url";

import { getGitRelativePath } from "../src/utils";

// Replaces the ES-only `stack-trace`, which Jest cannot load and these tests
// do not use.
jest.mock("stack-trace", () => ({ get: jest.fn() }));

describe("getGitRelativePath", () => {
  let root: string;
  let cwd: string;

  // Creates `<root>/bench-repo` (holds the benchmark) and `<root>/other-repo`
  // (the current directory), each with its own `.git`.
  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), "codspeed-git-")));
    for (const repo of ["bench-repo", "other-repo"]) {
      mkdirSync(path.join(root, repo, ".git"), { recursive: true });
    }
    mkdirSync(path.join(root, "bench-repo", "benches"));
    mkdirSync(path.join(root, "no-repo"));
    cwd = process.cwd();
    process.chdir(path.join(root, "other-repo"));
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  });

  it("uses the repository of the file for a path", () => {
    const file = path.join(root, "bench-repo", "benches", "a.bench.js");
    expect(getGitRelativePath(file)).toBe("benches/a.bench.js");
  });

  it("uses the repository of the file for a file URL", () => {
    const file = path.join(root, "bench-repo", "benches", "a.bench.mjs");
    expect(getGitRelativePath(pathToFileURL(file).href)).toBe(
      "benches/a.bench.mjs",
    );
  });

  it("throws when the file is in no repository", () => {
    const file = path.join(root, "no-repo", "a.bench.mjs");
    expect(() => getGitRelativePath(pathToFileURL(file).href)).toThrow(
      "Could not find a git repository",
    );
  });
});
