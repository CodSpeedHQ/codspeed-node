import { writeFileSync } from "fs";
import path from "path";

import { getInstrumentMode } from "./runnerMode";

const CUSTOM_INTROSPECTION_EXIT_CODE = 0;

const V8_LOG_FILENAME_PATTERN = "codspeed-v8-%p.log";

/**
 * Flags that pin the per-process sources of run-to-run variance in walltime
 * mode. All 17 benchmarks in a process share one compilation of the code under
 * test, so a single nondeterministic decision shifts every one of them together
 * — measured at ~4% between otherwise identical runs, which is most of the way
 * to CodSpeed's 5% threshold on its own (COD-3036).
 *
 * Each flag removes one source, and each was measured to matter:
 *
 * - `--no-concurrent-recompilation`: optimise on the benchmark thread. Otherwise
 *   the optimised code is installed whenever a background compile happens to
 *   finish, so the feedback it was compiled against — and the resulting inlining
 *   decisions — differ between runs.
 * - `--hash-seed`, `--random-seed`: V8 randomises the string hash seed per
 *   isolate, which reshuffles every hash bucket and so changes collision chains
 *   and cache behaviour for Map/Set/string-keyed workloads.
 * - `--no-flush-bytecode`, `--no-flush-baseline-code`: V8 discards code for
 *   functions not recently executed, so code can be thrown away and recompiled
 *   part-way through a suite depending on timing.
 *
 * Every flag here either pins a random input or fixes *when* an optimisation
 * happens. None withhold an optimisation — the benchmark has to measure the code
 * the runtime would really produce. Excluded on that ground:
 *
 * - `--no-use-osr`: took `MaxHeap churn` from 11.67% to 0.67% by stopping a
 *   running loop from being optimised at all, and made it 24% slower — which is
 *   precisely the measurement error it looked like it was fixing.
 * - `--no-maglev`: removes a whole tier, and measured worse anyway.
 * - `--always-osr`: the legitimate way to make OSR deterministic (force it
 *   rather than wait for a timing-dependent heuristic). Helps when a suite runs
 *   alone, but regressed an allocation-heavy benchmark from 0.92% to 11.47% in a
 *   full suite.
 * - `--predictable`: implies `--single-threaded`, which gives by far the best JIT
 *   determinism measured (0.39% on one benchmark) but leaves whole processes in a
 *   pathological major-collection regime, 2–3× apart run to run. Collecting
 *   before every sample does not rescue it.
 * - `--no-memory-reducer` and a pinned young generation
 *   (`--min-semi-space-size` = `--max-semi-space-size`): plausible on paper, and
 *   they do reduce GC scheduling noise, but they regressed the benchmarks that
 *   were *most* stable without them — one went from 0.64% to 12.69%. Pinning the
 *   young generation changes promotion behaviour, which is not neutral for
 *   allocation-heavy code.
 */
const WALLTIME_DETERMINISM_FLAGS = [
  "--no-concurrent-recompilation",
  "--hash-seed=1",
  "--random-seed=1",
  "--no-flush-bytecode",
  "--no-flush-baseline-code",
];

export const getV8Flags = () => {
  const nodeVersionMajor = parseInt(process.version.slice(1).split(".")[0]);
  const instrumentMode = getInstrumentMode();

  const flags = ["--interpreted-frames-native-stack", "--allow-natives-syntax"];

  switch (instrumentMode) {
    case "analysis": {
      flags.push(
        ...[
          "--hash-seed=1",
          "--random-seed=1",
          "--no-opt",
          "--predictable",
          "--predictable-gc-schedule",
          "--expose-gc",
          "--no-concurrent-sweeping",
          "--max-old-space-size=4096",
        ],
      );
      if (nodeVersionMajor < 18) {
        flags.push("--no-randomize-hashes");
      }
      if (nodeVersionMajor < 20) {
        flags.push("--no-scavenge-task");
      }

      break;
    }

    case "walltime": {
      flags.push(...WALLTIME_DETERMINISM_FLAGS);

      // Emit the V8 jitdump
      flags.push("--perf-prof");

      const v8LogDir = process.env.CODSPEED_V8_LOG;
      if (v8LogDir) {
        flags.push(
          ...[
            "--log-code",
            "--no-log-source-code",
            "--no-logfile-per-isolate",
            `--logfile=${path.join(v8LogDir, V8_LOG_FILENAME_PATTERN)}`,
          ],
        );
      } else {
        // Just output the perf.map
        flags.push("--perf-basic-prof");
      }
    }
  }

  // COD-3036 experiment scaffolding: lets a walltime run sweep extra V8 flags
  // (tier-up, GC) without republishing the plugin. Temporary.
  const extra = process.env.CODSPEED_EXTRA_V8_FLAGS;
  if (extra) {
    flags.push(...extra.split(/\s+/).filter((flag) => flag !== ""));
  }

  return flags;
};

export const tryIntrospect = () => {
  if (process.env.__CODSPEED_NODE_CORE_INTROSPECTION_PATH__ !== undefined) {
    const introspectionMetadata = {
      flags: getV8Flags(),
    };
    writeFileSync(
      process.env.__CODSPEED_NODE_CORE_INTROSPECTION_PATH__,
      JSON.stringify(introspectionMetadata),
    );
    process.exit(CUSTOM_INTROSPECTION_EXIT_CODE);
  }
};

export const checkV8Flags = () => {
  const requiredFlags = getV8Flags();
  const actualFlags = process.execArgv;
  const missingFlags = requiredFlags.filter(
    (flag) => !actualFlags.includes(flag),
  );
  if (missingFlags.length > 0) {
    console.warn(
      `[CodSpeed] missing required flags: ${missingFlags.join(", ")}`,
    );
  }
};
