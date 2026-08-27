/* eslint-disable @typescript-eslint/no-require-imports */
export {}; // Make this a module

const { getUnsupportedNodeVersionWarning, warnCi } = require("..") as {
  getUnsupportedNodeVersionWarning: (version: string) => string | null;
  warnCi: (message: string, title: string) => void;
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

describe("warnCi", () => {
  const originalEnv = {
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
    GITLAB_CI: process.env.GITLAB_CI,
  };
  let write: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    write = jest.spyOn(process.stdout, "write").mockReturnValue(true);
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    jest.restoreAllMocks();
  });

  it("should emit an annotation on GitHub Actions", () => {
    process.env.GITHUB_ACTIONS = "true";

    warnCi("a 100% clear\nwarning", "A title: with, separators");

    expect(write).toHaveBeenCalledWith(
      "::warning title=A title%3A with%2C separators::a 100%25 clear%0Awarning\n",
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("should colour the warning on GitLab CI", () => {
    process.env.GITLAB_CI = "true";

    warnCi("a warning", "A title");

    expect(warn).toHaveBeenCalledWith("\x1b[33ma warning\x1b[0m");
    expect(write).not.toHaveBeenCalled();
  });

  it("should log the warning as is outside of CI", () => {
    warnCi("a warning", "A title");

    expect(warn).toHaveBeenCalledWith("a warning");
    expect(write).not.toHaveBeenCalled();
  });
});
