declare const __VERSION__: string;

/**
 * @deprecated
 * TODO: try to use something like `updateTask` from `@vitest/runner` instead to use the output
 * of vitest instead console.log but at the moment, `updateTask` is not exposed
 */
function logCodSpeed(message: string) {
  console.log(`[CodSpeed] ${message}`);
}

let teardownHappened = false;

export default function () {
  logCodSpeed(`@codspeed/vitest-runner v${__VERSION__} - setup`);

  return () => {
    if (teardownHappened) throw new Error("teardown called twice");
    teardownHappened = true;

    logCodSpeed(`@codspeed/vitest-runner v${__VERSION__} - teardown`);
  };
}
