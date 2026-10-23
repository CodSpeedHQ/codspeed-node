import { fromPartial } from "@total-typescript/shoehorn";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type RunnerTestSuite,
} from "vitest";
import { WalltimeRunner } from "../legacy/walltime";

const coreMocks = vi.hoisted(() => {
  return {
    InstrumentHooks: {
      startBenchmark: vi.fn(),
      stopBenchmark: vi.fn(),
      setExecutedBenchmark: vi.fn(),
      addMarker: vi.fn(),
      currentTimestamp: vi.fn(() => 0n),
    },
    setupCore: vi.fn(),
    writeWalltimeResults: vi.fn(),
    collectGarbage: vi.fn(),
    isGcBetweenRoundsEnabled: vi.fn(() => false),
    getWalltimeForks: vi.fn((): number | undefined => undefined),
    isFork: vi.fn(() => false),
    runForks: vi.fn((): number[] => []),
    writeForkSamples: vi.fn(),
  };
});

const BENCH_OPTIONS = {
  iterations: 3,
  time: 0,
  warmupIterations: 2,
  warmupTime: 0,
};

/** Calls of the bench functions and of the mocked GC, in order. */
const events = vi.hoisted((): string[] => []);

vi.mock("@codspeed/core", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@codspeed/core")>();
  return { ...mod, ...coreMocks };
});

console.warn = vi.fn();

// Fully mocked: it loads the Vitest 3/4 runner, absent from the Vitest 5 devDependency.
vi.mock("../legacy/compat", () => {
  interface SuiteLike {
    id: string;
    type: string;
    name: string;
    mode?: string;
    result?: unknown;
    tasks: SuiteLike[];
  }

  // Like Vitest, keeps each bench's function next to its task.
  const benchFns = new WeakMap<object, () => void>();
  const getBenchFn = (task: SuiteLike) => {
    if (!benchFns.has(task)) {
      benchFns.set(task, () => {
        events.push(`fn:${task.name}`);
      });
    }
    return benchFns.get(task)!;
  };

  // Mirrors Vitest's benchmark suite execution: sub-suites run first, then
  // the suite's own benches run after a `suite-prepare` event for the suite,
  // each as a tinybench `Task` that is warmed up then run.
  class NodeBenchmarkRunner {
    async importTinybench() {
      return import("tinybench");
    }

    async runSuite(suite: SuiteLike): Promise<void> {
      await this.runBenchmarkSuite(suite);
    }

    private async runBenchmarkSuite(suite: SuiteLike): Promise<void> {
      for (const task of suite.tasks) {
        if (task.type === "suite") {
          await this.runBenchmarkSuite(task);
        }
      }

      const benches = suite.tasks.filter((task) => task.type === "test");
      if (benches.length === 0) {
        return;
      }

      await (this as unknown as WalltimeRunner).onTaskUpdate(
        [],
        [[suite.id, "suite-prepare", undefined]],
      );
      const { Bench, Task } = await this.importTinybench();
      for (const task of benches) {
        if (task.mode !== undefined && task.mode !== "run") {
          continue;
        }
        const tinybenchTask = new Task(
          new Bench({
            iterations: 3,
            time: 0,
            warmupIterations: 2,
            warmupTime: 0,
          }),
          task.name,
          getBenchFn(task),
        );
        await tinybenchTask.warmup();
        await tinybenchTask.run();
        task.result = { state: "pass", benchmark: tinybenchTask.result };
      }
    }
  }

  return {
    NodeBenchmarkRunner,
    getBenchFn,
    getBenchOptions: vi.fn(() => ({
      iterations: 3,
      time: 0,
      warmupIterations: 2,
      warmupTime: 0,
    })),
  };
});

const FILE_URI = "packages/vitest-plugin/src/__tests__/walltime.test.ts";

const NESTED_URI = `${FILE_URI}::nested suite::nested bench`;
const TOP_LEVEL_URI = `${FILE_URI}::top-level bench`;

function createSuite(): RunnerTestSuite {
  return fromPartial<RunnerTestSuite>({
    id: "file",
    type: "suite",
    file: { filepath: __filename },
    name: "walltime.test.ts",
    tasks: [
      {
        id: "nested",
        type: "suite",
        name: "nested suite",
        tasks: [
          { type: "test", name: "nested bench", meta: { benchmark: true } },
        ],
      },
      { type: "test", name: "top-level bench", meta: { benchmark: true } },
    ],
  });
}

function writtenBenchmarks() {
  return coreMocks.writeWalltimeResults.mock.calls.flatMap(
    ([benchmarks]) => benchmarks,
  );
}

describe("WalltimeRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    events.length = 0;
    coreMocks.collectGarbage.mockImplementation(() => {
      events.push("gc");
    });
  });

  afterEach(() => {
    coreMocks.isGcBetweenRoundsEnabled.mockReturnValue(false);
    coreMocks.getWalltimeForks.mockReturnValue(undefined);
    coreMocks.isFork.mockReturnValue(false);
    delete process.env.CODSPEED_ISOLATED_BENCHMARK;
  });

  it("prefixes top-level and nested bench URIs with the file path", async () => {
    const runner = new WalltimeRunner(fromPartial({}));
    const suite = fromPartial<RunnerTestSuite>({
      id: "file",
      type: "suite",
      file: { filepath: __filename },
      name: "walltime.test.ts",
      tasks: [
        {
          id: "nested",
          type: "suite",
          name: "nested suite",
          tasks: [
            { type: "test", name: "nested bench", meta: { benchmark: true } },
          ],
        },
        { type: "test", name: "top-level bench", meta: { benchmark: true } },
      ],
    });

    await runner.runSuite(suite);

    const uris = coreMocks.InstrumentHooks.setExecutedBenchmark.mock.calls.map(
      ([, uri]) => uri,
    );
    expect(uris).toEqual([NESTED_URI, TOP_LEVEL_URI]);
  });

  it("collects garbage before every warmup and measured round", async () => {
    coreMocks.isGcBetweenRoundsEnabled.mockReturnValue(true);
    const runner = new WalltimeRunner(fromPartial({}));

    await runner.runSuite(createSuite());

    // Every call of the bench function (including tinybench's async probe,
    // which also runs `beforeEach` first) is preceded by exactly one GC.
    const rounds = BENCH_OPTIONS.warmupIterations + BENCH_OPTIONS.iterations;
    for (const name of ["nested bench", "top-level bench"]) {
      const benchEvents = events.filter(
        (event) => event === "gc" || event === `fn:${name}`,
      );
      const fnCalls = benchEvents.filter((event) => event !== "gc").length;
      expect(fnCalls).toBeGreaterThanOrEqual(rounds);
    }
    expect(events.length % 2).toBe(0);
    for (let i = 0; i < events.length; i += 2) {
      expect(events[i]).toBe("gc");
      expect(events[i + 1]).toMatch(/^fn:/);
    }
  });

  it("merges the samples of every fork into one result", async () => {
    const forkSamples = [3, 1, 2, 5, 4];
    coreMocks.getWalltimeForks.mockReturnValue(3);
    coreMocks.runForks.mockReturnValue(forkSamples);
    const runner = new WalltimeRunner(fromPartial({}));

    await runner.runSuite(createSuite());

    expect(events).toEqual([]);
    expect(coreMocks.InstrumentHooks.startBenchmark).not.toHaveBeenCalled();
    expect(
      coreMocks.InstrumentHooks.setExecutedBenchmark,
    ).not.toHaveBeenCalled();
    expect(coreMocks.runForks.mock.calls).toEqual([
      [NESTED_URI, 3],
      [TOP_LEVEL_URI, 3],
    ]);
    const benchmarks = writtenBenchmarks();
    expect(benchmarks.map((benchmark) => benchmark.uri)).toEqual([
      NESTED_URI,
      TOP_LEVEL_URI,
    ]);
    for (const benchmark of benchmarks) {
      expect(benchmark.stats.rounds).toBe(forkSamples.length);
      expect(benchmark.stats.min_ns).toBe(1_000_000);
      expect(benchmark.stats.max_ns).toBe(5_000_000);
    }
  });

  it("runs only the isolated bench in a fork and hands its samples over", async () => {
    coreMocks.isFork.mockReturnValue(true);
    process.env.CODSPEED_ISOLATED_BENCHMARK = TOP_LEVEL_URI;
    const runner = new WalltimeRunner(fromPartial({}));

    await runner.runSuite(createSuite());

    expect(new Set(events)).toEqual(new Set(["fn:top-level bench"]));
    expect(
      coreMocks.InstrumentHooks.setExecutedBenchmark.mock.calls.map(
        ([, uri]) => uri,
      ),
    ).toEqual([TOP_LEVEL_URI]);
    expect(coreMocks.writeForkSamples).toHaveBeenCalledTimes(1);
    const [samples] = coreMocks.writeForkSamples.mock.calls[0];
    expect(samples).toHaveLength(BENCH_OPTIONS.iterations);
    expect(coreMocks.writeWalltimeResults).not.toHaveBeenCalled();
  });
});
