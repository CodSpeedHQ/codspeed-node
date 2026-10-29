import { connect, createServer, type Server } from "node:net";
import { afterAll, beforeAll, test } from "vitest";

// Fixed on purpose: a second process holding it must fail with EADDRINUSE.
const PORT = 48_123;
let server: Server;

beforeAll(() => {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server = createServer((socket) => socket.end())
    .once("error", reject)
    .listen(PORT, resolve);
  return promise;
});

afterAll(() => {
  const { promise, resolve } = Promise.withResolvers<void>();
  server.close(() => resolve());
  return promise;
});

test("exclusive port", async ({ bench }) => {
  await bench("connect", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    connect(PORT).once("close", resolve);
    return promise;
  }).run();
});
