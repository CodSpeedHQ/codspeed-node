declare const __VERSION__: string;

/**
 * @deprecated
 * TODO: try to use something like `updateTask` from `@vitest/runner` instead to use the output
 * of vitest instead console.log but at the moment, `updateTask` is not exposed
 */
function logCodSpeed(message: string) {
  console.log(`[CodSpeed] ${message}`);
}

let setupHappened = false;
let teardownHappened = false;

// Vitest 5 clones a dedicated `(bench)` project from the base one and runs the
// same globalSetup module for both, so setup and teardown each fire twice.
// Report only the first pass and make the repeats no-ops; throwing on the second
// teardown fails the whole run during close.
export default function () {
  if (!setupHappened) {
    setupHappened = true;
    logCodSpeed(`@codspeed/vitest-plugin v${__VERSION__} - setup`);
  }

  return () => {
    if (teardownHappened) return;
    teardownHappened = true;

    logCodSpeed(`@codspeed/vitest-plugin v${__VERSION__} - teardown`);
  };
}
