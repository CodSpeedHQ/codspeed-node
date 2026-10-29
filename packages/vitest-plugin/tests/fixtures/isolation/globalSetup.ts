import { createServer, type Server } from "net";
import type { TestProject } from "vitest/node";

// Fixed on purpose: a fork that ran this setup again would fail with EADDRINUSE.
const PORT = 48_124;

declare module "vitest" {
  export interface ProvidedContext {
    port: number;
  }
}

// Vitest 5 runs this for the base project and for the `(bench)` project it
// clones from it, in the same process: bind once, and provide to both.
let server: Server | undefined;

export default async function setup(project: TestProject) {
  if (server === undefined) {
    const listening = Promise.withResolvers<void>();
    server = createServer((socket) => socket.end())
      .once("error", listening.reject)
      .listen(PORT, listening.resolve);
    await listening.promise;
  }
  project.provide("port", PORT);

  return () => {
    const closed = Promise.withResolvers<void>();
    if (server === undefined) return closed.resolve();
    server.close(() => closed.resolve());
    server = undefined;
    return closed.promise;
  };
}
