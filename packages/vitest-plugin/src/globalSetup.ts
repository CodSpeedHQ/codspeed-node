declare const __VERSION__: string | undefined;

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
  // log the version of the plugin if the global variable is defined
  const VERSION = typeof __VERSION__ === "string" ? `v${__VERSION__} ` : "";

  logCodSpeed(`@codspeed/vitest-plugin ${VERSION}- setup`);

  return () => {
    if (teardownHappened) throw new Error("teardown called twice");
    teardownHappened = true;

    logCodSpeed(`@codspeed/vitest-plugin ${VERSION}- teardown`);
  };
}
