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

// TODO: Check if this can be avoided
// Vitest 5 forks a dedicated `(bench)` project from the base one and runs
// globalSetup for both it and the root project, so setup/teardown fire more than
// once against this shared module. Log only the first pass and make the rest
// no-ops rather than treating the repeat as an error.
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
