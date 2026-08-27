import { getV8Flags } from "./introspection";

describe("getV8Flags", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // getCodspeedRunnerMode reports "disabled" unless it sees a runner.
    process.env = { ...originalEnv, CODSPEED_ENV: "runner" };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("walltime", () => {
    beforeEach(() => {
      process.env.CODSPEED_RUNNER_MODE = "walltime";
    });

    it("pins the per-process sources of run-to-run variance", () => {
      // A whole benchmark suite shares one compilation of the code under test,
      // so any nondeterminism here shifts every benchmark in the process
      // together and shows up directly in the reported walltime.
      expect(getV8Flags()).toEqual(
        expect.arrayContaining([
          "--no-concurrent-recompilation",
          "--hash-seed=1",
          "--random-seed=1",
          "--no-flush-bytecode",
          "--no-flush-baseline-code",
        ]),
      );
    });

    it("never withholds an optimisation, however much variance that would remove", () => {
      // A benchmark has to measure the code the runtime would really produce.
      // `--no-use-osr` and `--no-maglev` both cut variance substantially and are
      // rejected anyway; `--predictable` serialises GC onto the benchmark thread.
      const flags = getV8Flags();

      expect(flags).not.toContain("--no-use-osr");
      expect(flags).not.toContain("--no-maglev");
      expect(flags).not.toContain("--always-osr");
      expect(flags).not.toContain("--no-opt");
      expect(flags).not.toContain("--predictable");
    });

    it("appends CODSPEED_EXTRA_V8_FLAGS last so it can negate a default", () => {
      process.env.CODSPEED_EXTRA_V8_FLAGS =
        "--concurrent-recompilation  --no-hash-seed";

      const flags = getV8Flags();

      expect(flags.slice(-2)).toEqual([
        "--concurrent-recompilation",
        "--no-hash-seed",
      ]);
      expect(flags.indexOf("--no-concurrent-recompilation")).toBeLessThan(
        flags.indexOf("--concurrent-recompilation"),
      );
    });
  });

  it("leaves other modes alone", () => {
    process.env.CODSPEED_RUNNER_MODE = "instrumentation";

    expect(getV8Flags()).not.toContain("--no-concurrent-recompilation");
  });
});
