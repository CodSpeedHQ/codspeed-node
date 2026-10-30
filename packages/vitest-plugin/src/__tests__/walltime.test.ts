import { fromPartial } from "@total-typescript/shoehorn";
import { describe, expect, it, vi, type RunnerTestSuite } from "vitest";
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
  };
});

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
    tasks: SuiteLike[];
  }

  // Mirrors Vitest's benchmark suite execution: sub-suites run first, then
  // the suite's own benches run after a `suite-prepare` event for the suite.
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
      const { Bench } = await this.importTinybench();
      for (const task of benches) {
        const bench = new Bench({
          iterations: 1,
          time: 0,
          warmupIterations: 0,
          warmupTime: 0,
        });
        bench.add(task.name, () => {});
        await bench.run();
      }
    }
  }

  return {
    NodeBenchmarkRunner,
    getBenchOptions: vi.fn(),
  };
});

const FILE_URI = "packages/vitest-plugin/src/__tests__/walltime.test.ts";

describe("WalltimeRunner", () => {
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
    expect(uris).toEqual([
      `${FILE_URI}::nested suite::nested bench`,
      `${FILE_URI}::top-level bench`,
    ]);
  });
});
