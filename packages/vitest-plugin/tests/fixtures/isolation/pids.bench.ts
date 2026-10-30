import { appendFileSync } from "fs";
import { describe, test, type BenchRegistration } from "vitest";

// Vitest swallows what workers print, so the PIDs that run each benchmark go
// to a file. `beforeAll` only runs when tinybench measures the benchmark.
function logPid(name: string) {
  return () =>
    appendFileSync(
      process.env.ISOLATION_LOG_FILE!,
      `ran ${process.pid} ${name}\n`,
    );
}

const firstForks = process.env.ISOLATION_FIXTURE_FIRST_FORKS;

describe("isolation", () => {
  test("benchmarks", async ({ bench }) => {
    const benchmarks: BenchRegistration<string>[] = [
      bench(
        "first",
        {
          beforeAll: logPid("first"),
          ...(firstForks && { forks: Number(firstForks) }),
        },
        () => {},
      ),
      bench("second", { beforeAll: logPid("second") }, () => {}),
    ];
    if (process.env.ISOLATION_FIXTURE_FAIL !== undefined) {
      benchmarks.push(
        bench("failing", () => {
          throw new Error("benchmark failed");
        }),
      );
    }
    await bench.compare(...benchmarks, { iterations: 4, time: 1 });
  });
});
