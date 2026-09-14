import { test } from "vitest";
import { commands } from "vitest/browser";

import {
  ROUND_GLOBAL,
  type CodSpeedRunRoundRequest,
  type CodSpeedRunRoundResponse,
} from "./protocol";

declare module "vitest/browser" {
  interface BrowserCommands {
    codspeedRunRound?: (
      request: CodSpeedRunRoundRequest,
    ) => Promise<CodSpeedRunRoundResponse>;
  }
}

const DEFAULT_WARMUP_ITERATIONS = 3;
// A single round takes tens of seconds under the simulation instrument, well
// past the default test timeout.
const BENCH_TIMEOUT_MS = 30 * 60_000;

/**
 * Options of a browser benchmark.
 */
export interface BenchOptions {
  /** Iterations run before the measured ones, to let the engine settle. */
  warmupIterations?: number;
  /** Rounds to measure in walltime mode. Analysis always measures a single one. */
  rounds?: number;
  /** Runs before every iteration, measured rounds included, and is never measured. */
  setup?: () => void | Promise<void>;
  /** Runs after every iteration, measured rounds included, and is never measured. */
  teardown?: () => void | Promise<void>;
}

/**
 * Wrap `fn` in the frame the profiler looks for to locate the benchmark in the
 * collected stacks. It has to run on the page's own stack, hence the wrapping
 * happening here rather than in the command handlers.
 */
function withRootFrame(fn: () => unknown) {
  return async function __codspeed_root_frame__() {
    return await fn();
  };
}

/**
 * Publish the round on the topmost window, timing included: the node half calls
 * it in the page instead of replying to a page that would then have to run the
 * benchmark itself, which would put the reply's own transport inside the
 * measured region. Test files run in a frame of their own, whose realm the
 * default execution context cannot reach.
 */
function publishRound(measured: () => Promise<unknown>): void {
  const scope = globalThis as unknown as { top?: Record<string, unknown> };
  const host = scope.top ?? (globalThis as unknown as Record<string, unknown>);
  host[ROUND_GLOBAL] = async function __codspeed_round__() {
    const startedAt = performance.now();
    await measured();
    return performance.now() - startedAt;
  };
}

/**
 * Declare a benchmark running in the browser, measured by CodSpeed.
 *
 * It is collected like any other Vitest benchmark, so the file it lives in is
 * picked up by `vitest bench`. Without an instrument attached the function still
 * runs, and its duration is reported.
 *
 * @example
 * ```ts
 * import { bench } from "@codspeed/vitest-plugin/browser";
 *
 * bench("render 400 rows", () => {
 *   renderList(items);
 * });
 * ```
 */
export function bench(
  name: string,
  fn: () => unknown,
  options: BenchOptions = {},
): void {
  const {
    warmupIterations = DEFAULT_WARMUP_ITERATIONS,
    setup,
    teardown,
  } = options;

  test(
    name,
    async (ctx) => {
      const measured = withRootFrame(fn);
      const fullTestName = ctx.task.fullTestName ?? ctx.task.name;
      const runRound = commands.codspeedRunRound;

      for (let i = 0; i < warmupIterations; i++) {
        await setup?.();
        await measured();
        await teardown?.();
      }
      publishRound(measured);

      let rounds = options.rounds ?? 1;
      let round = 0;
      do {
        await setup?.();
        if (runRound !== undefined) {
          ({ rounds } = await runRound({
            fullTestName,
            name,
            rounds: options.rounds,
          }));
        } else {
          const startedAt = performance.now();
          await measured();
          const durationMs = performance.now() - startedAt;
          console.log(
            `[CodSpeed] ${fullTestName}: ${durationMs.toFixed(3)} ms`,
          );
        }
        await teardown?.();
        round += 1;
      } while (round < rounds);
    },
    BENCH_TIMEOUT_MS,
  );
}
