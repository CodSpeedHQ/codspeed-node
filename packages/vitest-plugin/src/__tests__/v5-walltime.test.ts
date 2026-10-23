import type * as Core from "@codspeed/core";
import { fromPartial } from "@total-typescript/shoehorn";
import type {
  BenchmarkGroup,
  BenchRegistrationInput,
  BenchRunOptions,
} from "vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Instrument from "../instrument";
import provider from "../v5/provider";

const coreMocks = vi.hoisted(() => ({
  InstrumentHooks: {
    startBenchmark: vi.fn(),
    stopBenchmark: vi.fn(),
    setExecutedBenchmark: vi.fn(),
    addMarker: vi.fn(),
    currentTimestamp: vi.fn(() => 0n),
  },
  getInstrumentMode: vi.fn(() => "walltime"),
  getGitDir: vi.fn(() => "/repo"),
  setupCore: vi.fn(),
  teardownCore: vi.fn(),
  collectGarbage: vi.fn(),
}));

vi.mock("@codspeed/core", async (importOriginal) => {
  const mod = await importOriginal<typeof Core>();
  return { ...mod, ...coreMocks };
});

vi.mock("../instrument", async (importOriginal) => {
  const mod = await importOriginal<typeof Instrument>();
  return { ...mod, writeAndLogWalltimeResults: vi.fn() };
});

const ITERATIONS = 3;

function run(registrations: BenchRegistrationInput[]) {
  const options: BenchRunOptions = {
    iterations: ITERATIONS,
    time: 0,
    warmup: false,
  };
  return provider.run(
    fromPartial<BenchmarkGroup>({
      test: fromPartial<BenchmarkGroup["test"]>({
        file: { filepath: "/repo/a.bench.ts" },
        fullTestName: "suite > test",
        context: {},
      }),
      registrations,
      options,
    }),
  );
}

describe("v5 walltime provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("collects garbage after the user's beforeEach, before every round", async () => {
    vi.stubEnv("CODSPEED_WALLTIME_GC_BETWEEN_ROUNDS", "true");
    const calls: string[] = [];
    coreMocks.collectGarbage.mockImplementation(() => calls.push("gc"));

    await run([
      fromPartial<BenchRegistrationInput>({
        name: "bench",
        fn: () => {
          calls.push("fn");
        },
        fnOpts: { beforeEach: () => calls.push("beforeEach") },
      }),
    ]);

    expect(calls.length).toBeGreaterThanOrEqual(ITERATIONS * 3);
    for (let i = 0; i < calls.length; i += 3) {
      expect(calls.slice(i, i + 3)).toEqual(["beforeEach", "gc", "fn"]);
    }
  });

  it("does not collect garbage when disabled", async () => {
    await run([
      fromPartial<BenchRegistrationInput>({ name: "bench", fn: () => {} }),
    ]);

    expect(coreMocks.collectGarbage).not.toHaveBeenCalled();
  });

  it("rejects forks", async () => {
    vi.stubEnv("CODSPEED_WALLTIME_FORKS", "2");

    await expect(
      run([
        fromPartial<BenchRegistrationInput>({ name: "bench", fn: () => {} }),
      ]),
    ).rejects.toThrow(
      "[CodSpeed] CODSPEED_WALLTIME_FORKS is not supported with Vitest 5 yet",
    );
  });
});
