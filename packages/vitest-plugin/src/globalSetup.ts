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

// Vitest 5 runs this module for the base project and for the `(bench)` project
// it clones from it, so setup and teardown each fire twice.
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
