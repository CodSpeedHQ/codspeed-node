// Runs every fork × warmup × measure cell `MATRIX_REPS` times, sequentially,
// in a different seeded order per repetition. Run from examples/with-vitest-v3.
import { execSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  renameSync,
} from "node:fs";
import { cpus, hostname, loadavg, release } from "node:os";
import { join, resolve } from "node:path";

const FORKS = (process.env.MATRIX_FORKS ?? "1,2,5,10").split(",").map(Number);
const WARMUPS = [0, 20, 100];
const MEASURES = [20, 100];
// Other projects (e.g. matthias-nodejs-variance) pass their own benches and config.
const BENCHMARKS = (process.env.MATRIX_BENCHMARKS ?? "cpu,json,allocation").split(",");
const CONFIG = process.env.MATRIX_CONFIG ?? "experiments/fork-matrix/vitest.config.ts";
const RUN_TIMEOUT_MS = 1_800_000;

const job = Number(process.env.MATRIX_JOB ?? 0);
const reps = Number(process.env.MATRIX_REPS ?? 5);
// Budget mode: "forks:fraction;..." cells, e.g. "3:1;3:0.5;1:1".
const budgetCells = process.env.MATRIX_BUDGET_CELLS;
// "forks,warmup,measure;..." restricts the cells, for smoke checks.
const only = process.env.MATRIX_ONLY;
const cells = budgetCells
  ? budgetCells.split(";").map((cell) => {
      const [forks, k] = cell.split(":").map(Number);
      return [forks, null, null, k];
    })
  : only
    ? only.split(";").map((cell) => cell.split(",").map(Number))
    : FORKS.flatMap((f) => WARMUPS.flatMap((w) => MEASURES.map((m) => [f, w, m])));

const root = process.cwd();
const output = resolve(process.env.MATRIX_OUTPUT ?? `experiments/fork-matrix/results/job-${job}`);
mkdirSync(output, { recursive: true });

const cpusAllowed = readFileSync("/proc/self/status", "utf8").match(/Cpus_allowed_list:\s*(\S+)/)?.[1];
writeFileSync(
  join(output, "metadata.json"),
  JSON.stringify(
    {
      job,
      reps,
      cells,
      hostname: hostname(),
      runner_name: process.env.RUNNER_NAME,
      github_run_id: process.env.GITHUB_RUN_ID,
      sha: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
      node: process.version,
      cpu: cpus()[0].model,
      cpu_count: cpus().length,
      cpus_allowed: cpusAllowed,
      kernel: release(),
      started: new Date().toISOString(),
    },
    null,
    2,
  ),
);

// Seeded Fisher-Yates, so each repetition runs the cells in its own order.
function shuffled(items, seed) {
  const order = [...items];
  let state = seed + 1;
  for (let i = order.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Profiling flags make each process write JIT dumps into the working
// directory and perf maps into /tmp: hundreds of megabytes per suite run.
function removeProfilingArtifacts(since) {
  for (const file of readdirSync(root)) {
    if (/^(jit-\d+\.dump|isolate-.*-v8\.log)$/.test(file)) rmSync(join(root, file), { force: true });
  }
  for (const file of readdirSync("/tmp")) {
    const path = join("/tmp", file);
    if (/^perf-\d+\.map$/.test(file) && statSync(path).mtimeMs >= since) rmSync(path, { force: true });
  }
}

for (let i = 0; i < reps; i++) {
  // Distinct per job, so every host runs the cells in different orders.
  const rep = job * reps + i;
  for (const [forks, warmup, measure, k] of shuffled(cells, rep)) {
    const id = k === undefined ? `rep${rep}-f${forks}-w${warmup}-m${measure}` : `rep${rep}-f${forks}-k${k}`;
    const dir = join(output, id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "results"), { recursive: true });

    const env = {
      ...process.env,
      CODSPEED_ENV: "true",
      CODSPEED_RUNNER_MODE: "walltime",
      // 0 = baseline: forks unset, all benchmarks run in one shared worker.
      ...(forks > 0 && { CODSPEED_WALLTIME_FORKS: String(forks) }),
      CODSPEED_PROFILE_FOLDER: dir,
      ...(k === undefined
        ? { MATRIX_WARMUP: String(warmup), MATRIX_MEASURE: String(measure) }
        : { MATRIX_BUDGET: String(k) }),
    };
    for (const key of ["CODSPEED_ISOLATED_BENCHMARK", "CODSPEED_FORK_SAMPLES_FILE", "CODSPEED_WALLTIME_GC_BETWEEN_ROUNDS", "CODSPEED_ISOLATION_COMMAND", ...(forks > 0 ? [] : ["CODSPEED_WALLTIME_FORKS"])]) {
      delete env[key];
    }

    const load = loadavg();
    const startedAt = Date.now();
    const start = performance.now();
    const result = spawnSync(
      process.execPath,
      ["node_modules/vitest/vitest.mjs", "bench", "--run", "--config", CONFIG],
      { cwd: root, env, encoding: "utf8", timeout: RUN_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
    );
    const elapsedMs = performance.now() - start;
    writeFileSync(join(dir, "run.log"), `${result.stdout}\n${result.stderr}`);
    removeProfilingArtifacts(startedAt);
    // Per-round recordings some projects write next to the results.
    if (existsSync(join(root, "results/rounds"))) renameSync(join(root, "results/rounds"), join(dir, "rounds"));
    if (result.status !== 0) {
      throw new Error(`${id} failed (${result.status ?? result.signal}): ${result.error ?? result.stderr.slice(-2000)}`);
    }

    const benchmarks = readdirSync(join(dir, "results"))
      .filter((file) => file.endsWith(".json"))
      .flatMap((file) => JSON.parse(readFileSync(join(dir, "results", file), "utf8")).benchmarks);
    const names = benchmarks.map((b) => b.name).sort();
    // Budget mode is time-based, so only the round minimum is guaranteed.
    const minRounds = Math.max(1, forks) * (k === undefined ? measure : Math.ceil(10 * k));
    const badRounds = (b) => (k === undefined ? b.stats.rounds !== minRounds : b.stats.rounds < minRounds);
    if (names.join() !== [...BENCHMARKS].sort().join() || benchmarks.some(badRounds)) {
      throw new Error(`${id}: unexpected results ${JSON.stringify(benchmarks.map((b) => [b.name, b.stats.rounds]))}`);
    }

    const record = {
      job,
      rep,
      forks,
      warmup,
      measure,
      budget: k ?? null,
      elapsed_ms: elapsedMs,
      load,
      stats: Object.fromEntries(
        benchmarks.map((b) => [b.name, { min_ns: b.stats.min_ns, median_ns: b.stats.median_ns, mean_ns: b.stats.mean_ns, rounds: b.stats.rounds }]),
      ),
    };
    appendFileSync(join(output, "runs.jsonl"), `${JSON.stringify(record)}\n`);
    // The job log keeps every result in case the job dies before uploading.
    console.log(`MATRIX_RUN ${JSON.stringify(record)}`);
  }
}
console.log("MATRIX COMPLETE");
if (existsSync(join(output, "runs.jsonl"))) {
  console.log(`runs: ${readFileSync(join(output, "runs.jsonl"), "utf8").trim().split("\n").length}`);
}
