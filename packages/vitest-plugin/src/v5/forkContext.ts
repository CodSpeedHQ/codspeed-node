import { randomUUID } from "crypto";
import { readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deserialize, serialize } from "v8";
import type { TestModule, TestProject } from "vitest/node";

const FORK_CONTEXT_FILE_ENV = "CODSPEED_VITEST_FORK_CONTEXT_FILE";

/** What each project's global setup provided, by project name. */
type ProvidedContexts = Record<string, Record<string, unknown>>;

/**
 * Hands the modules' provided context to the forks `run` starts, through a
 * file the forks inherit by its environment variable (not the environment
 * itself: a large provided fixture would exceed its size limit).
 */
export async function withForkContext<T>(
  modules: readonly TestModule[],
  run: () => Promise<T>,
): Promise<T> {
  const contexts: ProvidedContexts = {};
  for (const { project } of modules) {
    contexts[project.name] = { ...project.getProvidedContext() };
  }
  const file = join(tmpdir(), `codspeed-vitest-context-${randomUUID()}`);
  writeFileSync(file, serialize(contexts));
  process.env[FORK_CONTEXT_FILE_ENV] = file;
  try {
    return await run();
  } finally {
    delete process.env[FORK_CONTEXT_FILE_ENV];
    rmSync(file, { force: true });
  }
}

/** In a fork: provides `project` what the parent's global setup provided it. */
export function provideParentContext(project: TestProject): void {
  const file = process.env[FORK_CONTEXT_FILE_ENV];
  if (file === undefined) {
    throw new Error("[CodSpeed] fork started without its parent's context");
  }
  const contexts: ProvidedContexts = deserialize(readFileSync(file));
  // `provide` is typed by the user's `ProvidedContext` augmentation, empty here.
  const provide = project.provide as (key: string, value: unknown) => void;
  for (const [key, value] of Object.entries(contexts[project.name] ?? {})) {
    provide(key, value);
  }
}
