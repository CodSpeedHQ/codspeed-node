// Summarizes downloaded job results: node analyze.mjs <dir containing job-*/>
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BENCHMARKS = ["cpu", "json", "allocation"];
const STATS = ["min_ns", "median_ns"];
const BOOTSTRAP_SAMPLES = 2000;

const dir = process.argv[2];
const jobs = readdirSync(dir).filter((name) => existsSync(join(dir, name, "runs.jsonl")));
const runs = jobs.flatMap((name) => {
  const { hostname } = JSON.parse(readFileSync(join(dir, name, "metadata.json"), "utf8"));
  return readFileSync(join(dir, name, "runs.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => ({ ...JSON.parse(line), host: hostname }));
});
const hosts = [...new Set(runs.map((run) => run.host))];
console.log(`${runs.length} runs from ${jobs.length} jobs on ${hosts.length} hosts: ${hosts.join(", ")}`);

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
};

// CV of the run-to-run noise within hosts: residuals after removing each
// host's mean, so a host that is uniformly faster does not count as noise.
function blockedCv(samples) {
  const byHost = Map.groupBy(samples, (s) => s.host);
  let squares = 0;
  for (const group of byHost.values()) {
    const hostMean = mean(group.map((s) => s.value));
    for (const s of group) squares += (s.value - hostMean) ** 2;
  }
  const dof = samples.length - byHost.size;
  return (100 * Math.sqrt(squares / dof)) / mean(samples.map((s) => s.value));
}

// Spread of host means relative to the grand mean.
function hostShift(samples) {
  const hostMeans = [...Map.groupBy(samples, (s) => s.host).values()].map((group) => mean(group.map((s) => s.value)));
  return (100 * (Math.max(...hostMeans) - Math.min(...hostMeans))) / mean(samples.map((s) => s.value));
}

let seed = 3984;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

// Resamples runs within each host, keeping the host structure.
function blockedCvInterval(samples) {
  const groups = [...Map.groupBy(samples, (s) => s.host).values()];
  const estimates = Array.from({ length: BOOTSTRAP_SAMPLES }, () =>
    blockedCv(groups.flatMap((group) => group.map(() => group[Math.floor(random() * group.length)]))),
  ).sort((a, b) => a - b);
  return [estimates[Math.floor(0.025 * BOOTSTRAP_SAMPLES)], estimates[Math.floor(0.975 * BOOTSTRAP_SAMPLES)]];
}

const cells = [...new Map(runs.map((r) => [`${r.forks},${r.warmup},${r.measure}`, [r.forks, r.warmup, r.measure]])).values()].sort(
  (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2],
);

const summary = cells.map(([forks, warmup, measure]) => {
  const cell = runs.filter((r) => r.forks === forks && r.warmup === warmup && r.measure === measure);
  const workloads = Object.fromEntries(
    BENCHMARKS.map((name) => [
      name,
      Object.fromEntries(
        STATS.map((stat) => {
          const samples = cell.map((r) => ({ host: r.host, value: r.stats[name][stat] }));
          return [
            stat,
            {
              mean_ms: mean(samples.map((s) => s.value)) / 1e6,
              blocked_cv: blockedCv(samples),
              blocked_cv_ci: blockedCvInterval(samples),
              host_shift: hostShift(samples),
            },
          ];
        }),
      ),
    ]),
  );
  return { forks, warmup, measure, runs: cell.length, runtime_s: median(cell.map((r) => r.elapsed_ms)) / 1000, workloads };
});
writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 2));

const fmt = (x, digits = 2) => x.toFixed(digits);
console.log("\n| Forks | Warmup | Measured | Runs | Suite s | min CV % (cpu/json/alloc) | median CV % (cpu/json/alloc) | host shift of min % (cpu/json/alloc) |");
console.log("|---:|---:|---:|---:|---:|---|---|---|");
for (const s of summary) {
  const cv = (stat) => BENCHMARKS.map((b) => fmt(s.workloads[b][stat].blocked_cv)).join(" / ");
  const shift = BENCHMARKS.map((b) => fmt(s.workloads[b].min_ns.host_shift)).join(" / ");
  console.log(`| ${s.forks} | ${s.warmup} | ${s.measure} | ${s.runs} | ${fmt(s.runtime_s)} | ${cv("min_ns")} | ${cv("median_ns")} | ${shift} |`);
}
console.log("\nMean min ms (cpu/json/alloc):");
for (const s of summary) {
  console.log(`f${s.forks} w${s.warmup} m${s.measure}: ${BENCHMARKS.map((b) => fmt(s.workloads[b].min_ns.mean_ms, 3)).join(" / ")}`);
}
