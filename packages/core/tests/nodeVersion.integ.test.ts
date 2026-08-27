/* eslint-disable @typescript-eslint/no-require-imports */
export {}; // Make this a module

const { getUnsupportedNodeVersionWarning } = require("..") as {
  getUnsupportedNodeVersionWarning: (version: string) => string | null;
};

describe("getUnsupportedNodeVersionWarning", () => {
  it.each(["22.22.2", "24.19.0"])("should not warn on Node %s", (version) => {
    expect(getUnsupportedNodeVersionWarning(version)).toBeNull();
  });

  it.each(["20.5.1", "23.11.0", "26.0.0"])(
    "should warn on Node %s",
    (version) => {
      expect(getUnsupportedNodeVersionWarning(version)).toBe(
        `[CodSpeed] Node.js v${version} is not supported: CodSpeed is tested on Node.js 22, 24. Support for other versions is experimental and measurements may be unstable.`,
      );
    },
  );
});
