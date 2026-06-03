/**
 * Wrap a benchmark function so it executes under a frame named
 * `__codspeed_root_frame__`. CodSpeed uses this frame to locate the
 * benchmark root in collected call stacks; samples without it cannot be
 * attributed to a benchmark.
 */
export function wrapWithRootFrame<T>(
  fn: () => T | Promise<T>,
): () => Promise<T> {
  return async function __codspeed_root_frame__() {
    return await fn();
  };
}

export function wrapWithRootFrameSync<T>(fn: () => T): () => T {
  return function __codspeed_root_frame__() {
    return fn();
  };
}
