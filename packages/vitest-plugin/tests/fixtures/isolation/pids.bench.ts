import { appendFileSync } from "fs";
import { connect } from "net";
import { describe, inject, test, type BenchRegistration } from "vitest";

// Vitest swallows what workers print, so the PIDs that run each benchmark go
// to a file. `beforeAll` only runs when tinybench measures the benchmark.
// It also connects to the global setup's server: a fork without the provided
// port, or one that re-ran the setup, fails here.
function logPid(name: string) {
  return async () => {
    const closed = Promise.withResolvers<void>();
    connect(inject("port"))
      .once("error", closed.reject)
      .once("close", () => closed.resolve());
    await closed.promise;
    appendFileSync(
      process.env.ISOLATION_LOG_FILE!,
      `ran ${process.pid} ${name}\n`,
    );
  };
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
