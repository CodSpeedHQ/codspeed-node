# COD-3036 — reducing walltime variance of the `generateFlameGraph` benches

Working notes. Metric that matters: **run-to-run spread of `min_ns`**, i.e.
`(max − min) / min` of the CodSpeed headline value across repeated, independent
CI-equivalent runs. Target: **< 5%** for every benchmark. tinybench's own
per-sample stddev is *not* the metric — CodSpeed reduces the samples to their
minimum.

## Root cause, found

The per-process shift is **two** separate causes stacked, and neither is random.

### Cause 1 — nondeterministic tier-up (JIT)

Which functions reach TurboFan varies between runs. Traced directly with
`--trace-opt --trace-deopt` on a focused two-fixture probe (2.8 s per run, so 20
repeats cost a minute instead of an hour):

- The optimisation trace is **bimodal**: 410-line and 418-line variants, an
  8-line (= 2 optimisation) difference. The function on the boundary is
  `getFunctionName`, plus one anonymous callee — they sometimes cross the tier-up
  threshold and sometimes do not.
- `initializeFlameGraph` runs an optimise → `wrong map` deopt → re-optimise
  cycle, and the number of cycles varies.

With the shipped flags (`--no-concurrent-recompilation --hash-seed=1
--random-seed=1 --no-flush-bytecode --no-flush-baseline-code`), **all 12 runs
produce a byte-identical normalised trace** — 295 lines, same functions, same
tiers, same deopts, same order. Cause 1 is closed.

### Cause 2 — concurrent GC racing the mutator

With the JIT trace byte-identical the measured value *still* spread 4.4%, so the
remainder is not the JIT. Hardware counters say exactly what it is (16 runs,
shipped flags, correlations against the measured value):

| counter | spread | CV | pearson vs `min_ns` |
| --- | --- | --- | --- |
| clock (GHz) | 0.01% | **0.00%** | −0.166 |
| instructions | 1.01% | **0.34%** | −0.131 |
| **IPC** | 1.52% | 0.45% | **−0.894** |
| **cache-misses** | 21.34% | 5.17% | **+0.563** |
| branch-misses | 5.62% | 1.95% | −0.261 |

So: **identical machine code, on an identically-clocked core, retiring the same
instruction count — but with materially different cache behaviour.** Frequency,
thermal and power are ruled out (clock constant to 0.00%); "different code got
compiled" is ruled out (instruction count constant to 0.34%).

A wrong turn worth recording: `codspeed.slice` allows CPUs 2-15, so I assumed
migration. Pinning to one core *does* help a lot (CV 1.11% → 0.43%). But the
probe reads `se.nr_migrations` from `/proc/self/task/*/sched`, and there are only
**1–4 migrations per run**, uncorrelated with the time (r = −0.12). Pinning was
treating a symptom.

What pinning actually did was put all seven threads on one core, which
**serialises V8's concurrent GC threads against the mutator**. That is the real
mechanism: the GC threads race the benchmark, the interleaving differs every run,
and marking and compaction therefore leave the heap laid out differently — same
code, different cache behaviour. Doing it directly, without any affinity:

| config | `recursive` CV | `v8_adapter` CV |
| --- | --- | --- |
| control | 0.51% | 0.72% |
| `--predictable-gc-schedule` | 0.68% | 0.55% |
| **`--single-threaded-gc`** | **0.38%** | **0.39%** |
| `--predictable-gc-schedule --single-threaded-gc` | 0.38% | 0.51% |
| `--predictable-gc-schedule` + pinned young gen | 0.86% | 0.85% |
| *pinned to one core (reference)* | *0.36%* | *0.34%* |

`--single-threaded-gc` recovers essentially all of the pinning benefit with no
affinity and ~0.2–1% absolute cost. Two arms confirm the direction of the
mechanism rather than just fitting it: `--no-incremental-marking` (CV 1.03%) and
`--no-compact` (CV 1.25%) both make it *worse*, as does `--no-memory-reducer`
(CV 1.16%) — which independently reproduces the suite-level finding that the GC
policy flags were harmful.

Note this is *not* `--predictable`. That implies `--single-threaded` for every
thread — compiler and platform included — and was catastrophic (18/31, worst
142%). `--single-threaded-gc` touches only the collector's parallelism.

### Cause 3 — two suites sharing a class, proven causally

This is the one that explains the original observation, and it is not a
statistical argument: it is a controlled A/B.

`MaxHeap build+drain [equal]`, measured on its own versus after merely
*exercising* `generateFlameGraph` in the same process — no extra live data, no
heap growth, no flag change, nothing else different:

| | `build [equal]` | `build+drain [descending]` | `build+drain [equal]` |
| --- | --- | --- | --- |
| MaxHeap alone | CV 0.31% | CV 0.24% | CV **0.28%** |
| after exercising `generateFlameGraph` | CV 0.46% | CV 0.39% | CV **5.27%** |
| absolute change | 4.17 → 5.03 ms (**+21%**) | 15.28 → 16.13 ms (+5.6%) | — |

An 18× jump in run-to-run CV, and the code is genuinely **slower** afterwards.

The reason is in the source: `generateFlameGraph` builds a
`MaxHeap<InternalFlameGraphNode>` (`generateFlameGraph.ts:310`) with its own
priority closure, while the MaxHeap suite measures `MaxHeap<Item>` with another.
`push`, `pop`, `siftUp`, `siftDown` and the `this.priority(item)` callsite are
**shared code that sees two object shapes and two closures**. V8 compiles it once
per process against whatever mixed feedback accumulated, and which of several
possible states it lands in varies from run to run. The +21% shows the
polymorphic state is worse code, not merely a noisier measurement.

That is the same mechanism as the very first finding — one shared
`generateFlameGraph` compiled once for 17 fixtures, moving all 17 together — now
demonstrated causally on a second, independent instance of it.

Two consequences, both benchmark-side and neither statistical:

1. **Hold one benchmark's inputs live at a time.** The suite retained all 17
   parsed fixtures and every MaxHeap input array for the whole process (~100 MB),
   so every major collection marked the entire set and each benchmark's GC cost
   was a function of the whole suite. Inputs are now created on first use and
   dropped in `afterAll`.
2. **Run each suite in its own process.** Not repetition — each benchmark is
   still measured exactly once, in exactly one process, and the two processes
   produce disjoint URIs so nothing needs merging and
   `assertSingleResultPerBenchmark` is satisfied. It removes the shared-class
   coupling outright.

A subtlety found while doing (1): tinybench calls the task function once outside
the measured loop *and outside the hooks*, to detect whether it is async, and it
swallows exceptions from that call. Populating inputs in `beforeAll` and nulling
them in `afterAll` therefore looks correct while silently making that probe call
throw — it halved the suite checksum, and was only caught by comparing it.
Inputs are built on demand instead.

Supporting evidence for the same point, from the isolated probes: nothing about
these benchmarks is variable on its own.

| benchmark | in isolation | in the full suite |
| --- | --- | --- |
| `MaxHeap build [ascending]` | CV **0.24%** | CV 0.55% (baseline) |
| `MaxHeap build [ascending]`, `--single-threaded-gc` | CV **0.33%** | CV **10.28%** |
| `MaxHeap build+drain [equal]` | CV **0.28%** | CV 3.28% (`lazy+sgc`) |
| `recursive_indirect_single_cycle` | CV 0.46% | CV 2.84% (baseline) |

Every configuration tried in isolation — control, `--single-threaded-gc`,
`--no-concurrent-marking`, all of them — lands between 0.2% and 1.0% CV. The full
suite is 3–30× worse. **The variance is manufactured by putting 31 benchmarks in
one process**, and the ballast experiments locate it: retaining the parsed
fixtures reproduces part of it, and exercising the shared `MaxHeap` code
reproduces the rest.

### Decomposing the GC flag

On the isolated probes (mean run-to-run CV of `min_ns`, flamegraph / MaxHeap):

| flag | flamegraph | MaxHeap |
| --- | --- | --- |
| control | 0.51% | 0.29% |
| `--single-threaded-gc` | 0.44% | 0.29% |
| `--no-concurrent-marking` | 0.90% | 0.27% |
| `--no-concurrent-marking --no-concurrent-sweeping` | 0.58% | 0.23% |
| **`--no-parallel-scavenge`** | **0.37%** | **0.21%** |
| `--no-parallel-marking` | V8 crashes | — |
| `--no-concurrent-marking --no-parallel-marking` | V8 crashes | — |

So it is the **young-generation collector** racing the mutator, not marking —
and `--no-parallel-scavenge` is a far narrower change than disabling all GC
parallelism. `--no-parallel-marking` aborts the process outright
(trace/breakpoint trap), alone or combined.

Three configurations validating at 15 repeats: lazy inputs alone, lazy +
`--single-threaded-gc`, lazy + `--no-parallel-scavenge`.



## Bottom line

**Cause.** Every benchmark in a node process shares one compilation of the code
under test. The quality of that compilation is drawn afresh each run and varies
by ~4%, which moves all of them together — a single latent per-process variable,
not per-benchmark noise. Demonstrated by extracting a per-suite multiplier
(4.17% range for the flamegraph suite vs 0.88% for MaxHeap in the *same*
process, so not machine drift) and by regression: each benchmark's sensitivity to
that factor is β ≈ 1.1–1.8, and dividing it out collapses 5–6% spreads to
1–2%.

**Fix shipped** — `codspeed-node`, `getV8Flags()` for walltime mode:

```
--no-concurrent-recompilation   optimise on the benchmark thread, so optimised
                                code is installed at a deterministic point from
                                deterministic feedback
--hash-seed=1 --random-seed=1   pin V8's per-isolate string hash seed
--no-flush-bytecode
--no-flush-baseline-code        stop compiled code being discarded mid-suite
```

Validated at **15 repeats each**, full suite, through the real runner against
staging:

| | over 5% | worst | max CV | median CV |
| --- | --- | --- | --- | --- |
| baseline | 10 / 31 | 11.34% | 2.84% | 1.06% |
| **with the flags** | **8 / 31** | **7.23%** | **2.17%** | 1.02% |

The benchmarks the issue was filed about — the recursion-path flamegraph
fixtures — improve the most:

| benchmark | baseline | fixed |
| --- | --- | --- |
| `recursive_indirect_multiple_cycles` | 11.34% | 7.23% |
| `recursive_indirect_single_cycle` | 11.30% | 6.06% |
| `recursive_direct` | 9.12% | 6.10% |
| `recursive_indirect_with_non_recursive_child` | 9.44% | 5.40% |
| `codegen with rootFunctionName` | 8.06% | 4.17% |
| `linter` | 4.34% | 2.63% |
| `formatter` | 4.58% | 2.42% |
| `synthetic-pid-tid` | 4.14% | 1.98% |

**Honest limitation: this does not reach "everything under 5%".** Eight
benchmarks still exceed it. The residual is the same per-process draw, reduced
but not removed, and no flag combination eliminated it without either disabling
an optimisation (forbidden, and it makes the benchmark measurably slower — i.e.
it *is* the error it appears to fix) or wrecking the allocation-heavy
benchmarks.

**The structural fix is a backend change**, documented below: run the suite in K
processes and reduce the K same-`uri` results to their minimum. That works
regardless of root cause, because the latent variable is per-process. It is
currently blocked by `assertSingleResultPerBenchmark`.

**Transferable guideline for benchmark authors:** a benchmark whose measured unit
is one long loop can only be optimised through on-stack replacement, mid-run, at
a timing-dependent point — the least reproducible shape there is. `MaxHeap churn`
(a single 50 000-iteration loop) was the worst benchmark in the suite at 12.4%;
splitting it into calls of 1 000 operations took it to 2.8% *and* made it faster,
with a byte-identical workload (checksum unchanged at `54360300198`).

## Setup

Everything runs on the dev macro runner (`ec2-ssh macro`, `3.250.81.188`,
aarch64 Graviton, gen-1 image: `codspeed.slice` pinned to CPUs 2-15,
`nohz_full=2-15`, `irqaffinity=0,1`).

- `codspeed-runner 5.1.0`, `--profile staging`, credentials copied from the dev
  box to `~/.config/codspeed/config.yaml`.
- Node 22.22.2 via fnm (platform's `package.json` pin). codspeed-node itself
  must be *built* with Node 20 — its rollup config uses `assert { type: json }`
  import assertions, removed in Node 22.
- `~/codspeed/codspeed-node` is checked out at the branch HEAD and symlinked
  into `platform/libs/shared-utils/node_modules/@codspeed/{core,tinybench-plugin}`
  (`~/cod3036/link.sh`), so plugin changes take effect without publishing.

Harness scripts live in `~/cod3036` on the runner:

| script | role |
| --- | --- |
| `env.sh` | PATH/XDG/fnm setup (the image's `XDG_CONFIG_HOME` points at an unwritable `/home/runner`) |
| `link.sh` | repoint platform's `@codspeed/*` at the local checkout |
| `csrun.sh` | one `codspeed run --mode walltime --profile staging` of the suite |
| `repeat.sh <label> <n>` | n independent runs into `~/cod3036/runs/<label>/` |
| `analyze.py <dir>` | run-to-run spread of `min_ns` per benchmark |

One run of the full suite = **~3m07s**, so one 6-repeat configuration ≈ 19 min.
That is the hard iteration budget; the machine can only run one at a time.

### Experiment scaffolding

`platform/libs/shared-utils/benches/labConfig.ts` held env-driven knobs
(`LAB_WARMUP_MS`, `LAB_TIME_MS`, `LAB_ITERS`, `LAB_BATCH_MS`, `LAB_ONLY`,
`LAB_LAZY_FIXTURES`, `LAB_GC_PER_SAMPLE`), all defaulting to off. It is deleted
now that the exploration is over; see "Reproducing this" below.

`codspeed-node/packages/core/src/introspection.ts` — `CODSPEED_EXTRA_V8_FLAGS`
appends arbitrary V8 flags to the set the node shim harvests. This one is kept:
it is how every configuration below was measured without republishing the
plugin, and it lets a user negate any of the new defaults.

Configurations are queued by `~/cod3036/queue.sh`, a single process that runs
them in order. An earlier design chained one script per batch, each waiting on
its predecessor's process name and then `exec`ing into the runner — which made
the name being waited on disappear, so successors fired immediately and three
sweeps ran concurrently on one machine. Anything measured while that overlap
lasted was discarded and re-run. Only ever run one configuration at a time.

## What the environment actually is (important, and easy to get wrong)

A CI walltime run is *heavily* perturbed relative to a plain `node bench.ts`.
Reproducing variance without these is measuring a different system:

1. The runner puts a `node` shim on `PATH` that re-execs the real node with the
   V8 flags the plugin reports via introspection. For walltime those are
   `--interpreted-frames-native-stack --allow-natives-syntax --perf-prof`, plus
   — because the profiler is on — `--log-code --no-log-source-code
   --no-logfile-per-isolate --logfile=…`. `--interpreted-frames-native-stack` in
   particular changes tier-up economics; `--log-code` writes a line per code
   object created, i.e. file I/O on every (de)optimisation.
2. `--enable-profiler` defaults to **true** (`src/cli/shared.rs`), so samply
   records at 997 Hz with PMU counters, under `sudo`.
3. Isolation on this image is the gen-1 fallback: `sudo systemd-run --scope
   --slice=codspeed.slice`, which reparents the bench out of samply's subtree.

I first built a hand-rolled harness and only later found (1) and (2); the
hand-rolled path is abandoned in favour of the real runner.

## Shape of the problem

From one run, the 31 benchmarks split into two regimes:

- **Tiny fixtures** (`recursive_*`, `synthetic-*`, `validate_*`, ~75–400 µs/call):
  tinybench collects 2 400–12 000 samples in its 1 s budget, with *enormous*
  per-sample stddev (up to 629%). `min` is therefore "the luckiest sample of
  ten thousand" — robust against isolated GC pauses, but entirely at the mercy
  of whether the best JIT tier was ever reached in that process.
- **Heavy fixtures** (`linter` 375 ms, `codegen truncated` 205 ms,
  `process_report` 149 ms, `formatter` 141 ms, ~30 ms `codegen`): capped at
  tinybench's `iterations: 64` floor, stddev 8–33%. Each call allocates tens of
  MB, so the value is dominated by where major collections land.

Prior investigation (Linear, 2026-07-17) established the mechanism for the
first regime: per-process V8 JIT state divergence locked in before the
measurement window — one run had the hot path TurboFan-optimised and inlined,
another kept it in Sparkplug for the *entire* window. PMU counters ruled out
machine noise (same clock, same core occupancy, 6.5% fewer instructions retired
at 10% worse IPC).

My structural hypothesis for *why* that divergence is possible: all 17 fixtures
call the **same** `generateFlameGraph` in the **same** process, with 17
different object shapes, so its optimised code is shared and drawn once.

## Baseline (6 runs, unmodified suite)

`10/31` benchmarks over 5% run-to-run spread of `min_ns`, worst **8.69%**.
Failures are all the small/medium `generateFlameGraph` fixtures plus
`MaxHeap partial-drain`. The heavy fixtures (`linter`, `formatter`,
`process_report`, `codegen truncated`) sit at 2.4–3.9%, so the GC-dominated
regime is *not* the problem.

### The variance is one shared per-process factor, not per-benchmark noise

Two things fall out of the result JSONs and they redirect the whole
investigation:

1. **Within a run, each benchmark's distribution is tight** (IQR ≈ 2–4%), and
   between runs `min`, `q1`, `median` and `q3` all move *by the same amount*.
   So the spread is not "the luckiest of ten thousand samples" — each process
   measures a wholesale different cost.
2. **All 17 `generateFlameGraph` fixtures move together.** Extracting a common
   per-run multiplier per suite:

   | run | flamegraph factor | MaxHeap factor |
   | --- | --- | --- |
   | 1 | 1.0086 | 1.0069 |
   | 2 | 1.0064 | 1.0069 |
   | 3 | 0.9749 | 1.0004 |
   | 4 | 1.0155 | 0.9999 |
   | 5 | 0.9937 | 0.9985 |
   | 6 | 0.9926 | 0.9982 |
   | **range** | **4.17%** | **0.88%** |

   Both suites run in the *same process*, so this cannot be machine drift,
   frequency scaling or a noisy neighbour — those would move MaxHeap too.

Dividing each benchmark by its suite's factor collapses almost every failure:

| benchmark | raw | residual after removing the group factor |
| --- | --- | --- |
| `validate_callgraph_synthetic` | 5.53% | 1.31% |
| `recursive_direct` | 5.09% | 1.65% |
| `recursive_indirect_multiple_cycles` | 5.73% | 1.77% |
| `recursive_indirect_single_cycle` | 6.46% | 2.20% |
| `linter` | 3.24% | 0.97% |
| `formatter` | 3.90% | 1.22% |
| `test_bench_fibo` | 8.69% | 4.99% |
| `MaxHeap partial-drain` | 8.64% | 8.64% |
| `process_report` | 3.22% | 5.14% |

**Therefore: one shared, per-process, all-or-nothing piece of state fixes the
cost of `generateFlameGraph` for every fixture in that process, and it is drawn
afresh each run with a ~4% range.** The obvious candidate is the machine code
V8 produces for `generateFlameGraph` and its callees: compiled once per process,
shared by all 17 tasks, and sensitive to *when* background TurboFan compilation
lands and *which* feedback it compiled against.

Two benchmarks have their own, unrelated problem (large residual):
`MaxHeap partial-drain 10%` (8.6%) and `process_report` (5.1%).

### Consequence for the candidate list

- Per-benchmark process isolation is **deprioritised**: it does not remove the
  bad draw, it just gives each fixture its own independent draw of the same
  ~4% magnitude. Likely neutral-to-worse.
- Everything that makes the shared compilation deterministic is the priority.

## Results

### The central finding: long loops are the unstable shape

Two independent lines of evidence converge on this, and it is the most
transferable result here.

`lean` (`--no-concurrent-recompilation` + fixed seeds + no code flushing) at 15
repeats improved **every single** `generateFlameGraph` benchmark, some by a
factor of two, while regressing exactly one family — the MaxHeap `build*` tasks:

| benchmark | baseline-15 | lean-15 |
| --- | --- | --- |
| `recursive_indirect_multiple_cycles` | 11.34% | **7.23%** |
| `recursive_indirect_single_cycle` | 11.30% | **6.06%** |
| `test_bench_fibo` | 11.29% | **6.69%** |
| `recursive_indirect_with_non_recursive_child` | 9.44% | **5.40%** |
| `recursive_direct` | 9.12% | **6.10%** |
| `codegen with rootFunctionName` | 8.06% | **4.17%** |
| `v8_adapter` | 7.61% | **4.93%** |
| `validate_callgraph_synthetic` | 6.20% | **4.17%** |
| `formatter` | 4.58% | **2.42%** |
| `linter` | 4.34% | **2.63%** |
| `synthetic-pid-tid` | 4.14% | **1.98%** |
| … | | |
| `MaxHeap build [ascending]` | 0.55% | 2.52% ← |
| `MaxHeap build+drain [ascending]` | 0.81% | 2.11% ← |
| `MaxHeap build+drain scaling n=1000` | 1.07% | 2.82% ← |
| `MaxHeap build [descending]` | 1.70% | **6.51%** ← |
| `MaxHeap build+drain [equal]` | 1.97% | **5.38%** ← |

What the regressing family has in common is not allocation or GC — it is that
its measured unit is **one 50 000-iteration loop**. `buildHeap` was
`for (const item of items) heap.push(item)`; `drain` was a single `while` over
`heap.pop()`. A loop like that is entered exactly *once* per sample, so the only
way V8 can optimise it is on-stack replacement: compile a loop-entry variant
while the loop is already running, from whatever feedback exists at the moment
the tier-up interrupt fires. Every other benchmark in the suite is a short body
called thousands of times and tiers up on a call boundary from settled feedback.

The second line of evidence is direct: `churn` had exactly that shape, was the
worst benchmark in the suite at 12.41%, and chunking it into `churnChunk` calls
of 1 000 operations took it to **2.77%** — while also making it *faster*
(40.5 ms → 38.6 ms). No flag involved.

So the fix for that family is in the benchmark, not in V8: split every hot loop
into calls of a hot function. Work is identical — the suite's checksum is
unchanged at `54360300198` — and nothing is disabled.

**Guideline for walltime benchmarks: make the measured unit a function called
many times, not one long loop.** A long loop is the one shape whose optimisation
is inherently timing-dependent, and it is a shape benchmark authors reach for
naturally.

### 15-repeat validation (equal n, the numbers to trust)

`(max−min)` grows with n, so only equal-n comparisons are meaningful — the
baseline's worst case is 8.69% over 6 runs and 11.34% over 15.

| config | n | over 5% | worst | max CV | flame fails | heap fails |
| --- | --- | --- | --- | --- | --- | --- |
| `baseline` | 15 | 10 / 31 | 11.34% | 2.84% | 10 | 0 |
| **`lean`** = `nocc` + seeds + no-flush | 15 | **8 / 31** | **7.23%** | **2.17%** | **6** | 2 |
| `leanchunk` = `lean` + every MaxHeap loop chunked | 15 | 9 / 31 | 9.30% | 2.18% | 6 | 3 |
| `det` = `lean` + `--always-osr` + GC flags | 15 | 5 / 31 | 13.99% | 4.51% | 3 | 2 |
| `det-nogc` = `det` without the GC flags | 15 | 17 / 31 | 23.15% | 5.68% | 11 | 6 |

`lean` is the recommendation. `det` shows fewer failures but a much worse tail
and nearly double the max CV, and both of its extra flags were individually shown
to regress benchmarks that were stable without them (`--always-osr`: 0.92% →
11.47%; GC flags: 0.64% → 12.69%). `det-nogc` is not evidence for the GC flags,
because it also carries `--always-osr`.

`leanchunk` settles the loop-chunking question: extending it from `churn` to
`buildHeap`/`drain`/partial-drain does *not* help and mildly hurts —
`build [random]` 4.46% → 9.03%, `partial-drain` 2.83% → 6.18%. Those loops are
dominated by the heap's own sift calls rather than the loop body, so the loop
itself is not where the time goes. Only the `churn` chunking is kept.

Every flamegraph benchmark improves under `lean`; the two MaxHeap failures it
introduces (`build+drain [equal]` 5.38%, `build [descending]` 6.51%) are the
price of `--no-concurrent-recompilation`, which is also the only thing that
fixes the flamegraph group.

#### The unresolved tension: `--no-concurrent-recompilation` vs `MaxHeap churn`

`det`'s two worst benchmarks are both MaxHeap regressions against a baseline
where every MaxHeap task was under 4.3%:

| benchmark | baseline-15 | det-15 | det-nogc-15 |
| --- | --- | --- | --- |
| `MaxHeap churn` | < 4.3% | 13.99% | 14.56% |
| `MaxHeap build+drain [equal]` | < 4.3% | 11.47% | 23.15% |

Traced back through the 6-repeat runs, `--no-concurrent-recompilation` is the
cause — the flag that produced the single biggest win on the flamegraph group:

| config | `MaxHeap churn` |
| --- | --- |
| baseline | 2.45% |
| `nocc` | 11.67% |
| `nocc --no-maglev` | 11.28% |
| `nocc --no-use-osr` | **0.67%** (disqualified: 24% slower) |
| `nocc --always-osr` (`det`) | 13.99% |
| `nocc` + seeds + noflush + GC, no OSR flag | 12.41% |

`--always-osr` fixed `churn` when the MaxHeap suite ran *alone* (4.16% → 2.86%)
but does nothing for it in the full suite. That asymmetry fits everything else
here: the flamegraph suite runs first, and with synchronous recompilation it
leaves the process in a different code-cache and heap state by the time MaxHeap
starts. The only intervention that fixed `churn` in the full suite was disabling
OSR, which is not allowed.

#### Per-sample GC: tested, dead end

`LAB_GC_PER_SAMPLE=minor` collects the young generation before every measured
sample (~130 µs, excluded from the sample since tinybench only times the
function). Two arms, 6 repeats each:

| config | over 5% | worst |
| --- | --- | --- |
| `--predictable` alone | 21 / 31 | 155.36% |
| `--predictable` + per-sample scavenge | 21 / 31 | 155.36% |
| allowed flag set + per-sample scavenge | 7 / 31 | 10.90% |

Neither works, and the `--predictable` numbers show why: the failures are not
*samples* perturbed by a collection, they are whole *processes* stuck in a bad
regime. `MaxHeap build+drain [equal]` has min 6 831 µs and max 17 444 µs — some
runs are 2.5× slower end to end. Serialised GC pushes those processes into a
pathological major-collection cadence for their entire lifetime, and emptying
the young generation before each sample does nothing about old-generation
growth.

On the allowed flag set it is mildly *harmful* (7/31 vs 5/31), which is the
expected trade: collecting right before a sample leaves a compacted,
cache-cold heap, so the sample pays cache misses it would not otherwise.

**`--predictable` is therefore definitively out**, and per-sample GC with it.

#### Per-flag attribution

With the individual arms in, each regression has a single owner:

| flag | effect |
| --- | --- |
| `--always-osr` | breaks `MaxHeap build+drain [equal]`: 0.92% → 11.47% |
| `--no-concurrent-recompilation` | breaks `MaxHeap churn`: 2.45% → ~12% |
| `--hash-seed`/`--random-seed`, `--no-flush-*`, GC flags | never implicated in any regression |

`--always-osr` is therefore dropped too, which left one configuration that had
never been measured on its own: the seed, code-flush and GC flags *without*
`--no-concurrent-recompilation`. Measured as `safe`, 6 repeats: **15/31 over 5%,
worst 12.69%** — considerably worse than doing nothing. `churn` is healthy there
(3.12%) but the flags regress the benchmarks that were the *most* stable at
baseline (`MaxHeap build [descending]` 0.64% → 12.69%).

So `--no-concurrent-recompilation` is not optional: it is the only thing that
fixes the flamegraph group, and the rest of the flags only work alongside it.

#### Fixing `churn` in the benchmark instead of in V8

That reframes the problem. `churn` is not unstable because V8 is doing something
wrong — it is unstable because of how it is *written*: one 50 000-iteration loop
per sample. A loop like that is entered once, so the only way V8 can optimise it
is on-stack replacement, mid-execution, at a point that depends on when the
tier-up interrupt fired. Every other benchmark in the suite is a short body
called thousands of times and tiers up on a call boundary from settled feedback.

The fix belongs in the benchmark, not the flag set: chunk the interleaving into
`churnChunk` calls of 1 000 push/pop pairs. Same total work, same access
pattern, but the hot function now tiers up by invocation count like everything
else. Nothing is disabled.

This generalises to a guideline for walltime benchmarks: **make the measured unit
a function called many times, not one long loop.** A long loop is the one shape
whose optimisation is inherently timing-dependent.

Result (`chunked`, 6 repeats): **1/31 over 5%, worst 9.55%** — and `churn` went
**12.41% → 2.77%**, while also getting *faster* (40.5 ms → 38.6 ms). Chunking
the loop works, and it costs nothing.

#### The GC flags have to go too

With `churn` fixed, the single remaining failure is
`cpp_google_benchmark_bm_vector_sort` at 9.55% — a benchmark that is perfectly
stable at baseline (3.19%, CV 1.00%) and under `--no-concurrent-recompilation`
alone (2.09%). It only breaks once the GC flags are added, which matches them
regressing the MaxHeap `build*` tasks — the *most* stable benchmarks at baseline
— in the `safe` run.

The earlier `det-nogc-15` result cannot be used to defend the GC flags: that arm
also carried `--always-osr`, now known to be harmful on its own, so it says
nothing about the GC flags in isolation.

Both landed, 6 repeats, chunked `churn`:

| config | over 5% | worst | failures |
| --- | --- | --- | --- |
| `chunked` (lean + GC flags) | 1 / 31 | 9.55% | `cpp_google…vector_sort` 9.55% |
| `lean` (`nocc` + seeds + no-flush) | 2 / 31 | 8.40% | `MaxHeap build+drain [equal]` 8.40%, `cpp_google…vector_sort` 5.27% |
| `nocconly` (`nocc` alone) | 7 / 31 | 8.42% | the whole recursion group again |

`nocconly` settles the seed and code-flush flags: without them the flamegraph
recursion group comes straight back (7/31), so they carry real weight rather
than being rounding error. The GC flags remain ambiguous — they help
`build+drain [equal]` and hurt `vector_sort`, netting out the same.

`lean` is preferred on grounds other than the score: every one of its flags
either pins a random input or fixes *when* an optimisation happens, and none
change GC policy for every CodSpeed user. Both go to a 15-repeat validation.

### 6-repeat exploration

Spread = `(max−min)/min` of `min_ns` across 6 runs, full suite,
`codspeed run --mode walltime --profile staging`.

| config | benches over 5% | worst | notes |
| --- | --- | --- | --- |
| `baseline` | **10 / 31** | 8.69% | unmodified |
| `nocc` (`--no-concurrent-recompilation`) | **2 / 31** | 11.67% | big win on the flamegraph group; regresses `MaxHeap churn` |
| `noifns` (`--no-interpreted-frames-native-stack`) | **7 / 31** | 7.27% | mild improvement; not the cause |
| `warm3s` (`LAB_WARMUP_MS=3000`) | **4 / 31** | 8.19% | helps, and *lowers* absolutes — the code keeps improving well past tinybench's 250 ms warmup |
| `pred` (`--predictable`) | **18 / 31** | 142.17% | catastrophic — but see below, it is the most informative run so far |
| `nocc-noosr` (`+ --no-use-osr`) | **2 / 31** | 6.60% | **best so far**; `MaxHeap churn` 11.67% → 0.67% |
| `nocc-nomaglev` (`+ --no-maglev`) | **6 / 31** | 11.28% | worse than `nocc` alone — removing the mid-tier hurts. Dead end |
| `nocc-noosr-warm3s` (`+ LAB_WARMUP_MS=3000`) | **3 / 31** | 6.92% | no better than `nocc-noosr`, ~30% slower. Warmup adds nothing once tier-up is deterministic |
| `nocc-noosr-hashseed` (`+ --hash-seed=1 --random-seed=1`) | **2 / 31** | **5.11%** | **best so far.** 29/31 under 5%, most under 2.6%; worst CV 2.16% vs 4.96% at baseline |
| `all` (`nocc + noosr + seeds + noflush + fixedheap`) | **1 / 31** | **5.48%** | **best.** every CV ≤ 1.88% (baseline reached 4.96%); absolutes back to baseline level |
| `baseline-noprof` (`CODSPEED_PROFILER_ENABLED=false`) | **7 / 31** | 10.80% | control: same as baseline. **The profiler is not a variance source** |
| `nocc-noosr-noprof` | **2 / 31** | 6.78% | control: identical to `nocc-noosr`. Confirms the profiler is irrelevant |
| `nocc-noosr-noflush` (`+ --no-flush-bytecode --no-flush-baseline-code`) | **2 / 31** | 5.39% | small improvement |
| `nocc-noosr-fixedheap` (`+ pinned young gen`) | **4 / 31** | 12.28% | regresses an allocation-heavy MaxHeap task — yet `all`, which *contains* these flags, was the best. At n=6 that contradiction is inside the estimator's noise |

`nocc`, per benchmark (baseline → nocc):

| benchmark | baseline | nocc |
| --- | --- | --- |
| `MaxHeap partial-drain 10%` | 8.64% | **1.31%** |
| `test_bench_fibo` | 8.69% | 6.32% |
| `test_bench_backtracking` | 6.49% | **2.57%** |
| `recursive_indirect_single_cycle` | 6.46% | **2.60%** |
| `v8_adapter` | 6.03% | 3.97% |
| `recursive_indirect_multiple_cycles` | 5.73% | **1.47%** |
| `validate_callgraph_synthetic` | 5.53% | 3.51% |
| `validate_callgraph_synthetic_recursive` | 5.34% | 3.73% |
| `recursive_indirect_with_non_recursive_child` | 5.33% | **1.95%** |
| `recursive_direct` | 5.09% | **2.09%** |
| `MaxHeap churn` | 2.45% | **11.67%** ← new failure |

Absolute values rise ~2% (synchronous compilation blocks execution), which is
irrelevant here — walltime results are only ever compared against themselves.

### Iteration counts are *not* the lever

Worth stating plainly, because it is the intuitive first thing to reach for and
it is wrong. In every failing benchmark, `min`, `q1`, `median` and `q3` move
between runs *by the same ratio*; e.g. `test_bench_fibo` under `nocc`:

| run | min | median | min/median |
| --- | --- | --- | --- |
| 1 | 5187.2 | 5266.9 | 0.985 |
| 3 | 5111.9 | 5190.0 | 0.985 |
| 4 | 5087.5 | 5164.3 | 0.985 |
| 6 | 5409.0 | 5472.7 | 0.988 |

So `min` is not an unstable order statistic here — it faithfully tracks a
process-wide cost shift. More rounds, longer `time`, or batching samples via
`overriddenDuration` cannot help: they all estimate the same shifted
distribution more precisely. **Candidates 3 and 5 from the original list are
dead ends**, and the entire problem is the quality of the machine code V8
produces in that process.

### `MaxHeap churn` under `nocc` is bimodal

| run | min | median |
| --- | --- | --- |
| 1 | 40741.3 | 41780.2 |
| 2 | 40165.5 | 41087.2 |
| 3 | 40323.7 | 41134.8 |
| 4 | **36484.8** | **37312.7** |
| 5 | 39915.3 | 40763.5 |
| 6 | **36666.1** | **37312.9** |

Two clean states 10% apart. Synchronous recompilation removed the flamegraph
group's draw but exposed a binary one in `churn` — a 50 000-iteration loop, so
*when* on-stack replacement fires inside it plausibly decides which of two code
shapes wins. `--no-use-osr` is queued to test exactly that.

### On-stack replacement was the `churn` culprit — but `--no-use-osr` is not the fix

Adding `--no-use-osr` to `nocc` confirmed the mechanism: `MaxHeap churn` went
**11.67% → 0.67%**. `churn` is a single 50 000-iteration loop, so the function
is entered once and optimised *while already running*, and OSR compiles a
loop-entry variant whose quality depends on where in the loop the tier-up
interrupt happened to fire.

**It is nonetheless disqualified.** A hard constraint on this work is that no
intervention may disable an optimisation or withhold an optimisation tier — the
benchmark has to measure the code the runtime would really produce. A targeted
screen on the MaxHeap suite alone made the cost explicit:

| config (all with `--no-concurrent-recompilation`) | `churn` spread | `churn` min | suite |
| --- | --- | --- | --- |
| heuristic OSR (default) | 4.16% | 24.2 ms | 0/14 over 5%, worst 4.16% |
| `--always-osr` | **2.86%** | **23.9 ms** | 0/14 over 5%, worst 3.83% |
| `--no-use-osr` | 1.34% | 30.0 ms | 1/14 over 5%, worst 12.27% |

`--no-use-osr` buys its stability by making the benchmark **24% slower** — it
is measuring worse code, which is exactly the measurement error it appeared to
fix. And it did not even help the suite as a whole.

`--always-osr` is the legitimate intervention: it removes the same
nondeterminism by *always* attempting OSR instead of leaving it to a
timing-dependent heuristic, and it is marginally **faster** than the default.
That is the shape every accepted flag has — pin a random input, or fix *when* an
optimisation happens, never whether it happens.

`--no-concurrent-osr` was checked first as the closer analogue of
`--no-concurrent-recompilation`, and is a no-op: `--concurrent-osr` already
defaults to off in Node 22's V8.

Note also that `churn`'s spread under plain `nocc` is 4.16% when the MaxHeap
suite runs alone versus 11.67% when it shares a process with the flamegraph
suite — further confirmation that the variance is a property of the *process*,
not of the benchmark.

`--no-concurrent-recompilation` makes the compile itself synchronous, but not
the *trigger point*: tier-up still fires off interrupt-budget counters that
depend on real time and GC, so the feedback present at compile time still
varies.

### `--predictable` splits the problem cleanly in two

18/31 fail, worst 142%, so it is unusable as-is — but it is the most
informative configuration so far, because the failures and the successes are
perfectly segregated:

| stable under `--predictable` | | blown up by `--predictable` | |
| --- | --- | --- | --- |
| `linter` | 0.39% | `MaxHeap build+drain [descending]` | 142.17% |
| `formatter` | 0.51% | `MaxHeap build+drain scaling n=200000` | 134.53% |
| `codegen` | 0.63% | `MaxHeap build+drain [random]` | 119.56% |
| `MaxHeap build+drain scaling n=1000` | 0.55% | `MaxHeap churn` | 109.60% |
| `MaxHeap build+drain [equal]` | 1.00% | `v8_adapter` | 94.15% |
| `recursive_direct` | 1.68% | `test_bench_fibo` | 84.21% |

`--predictable` implies `--single-threaded`, which implies both
`--no-concurrent-recompilation` *and* single-threaded GC (no concurrent
marking, sweeping or parallel scavenge).

- The JIT half becomes **almost perfectly deterministic** — 0.39% on `linter`
  is an order of magnitude better than anything else measured. That confirms
  beyond doubt that the baseline variance is JIT nondeterminism, and that it is
  removable in principle.
- The GC half **explodes**: with collection serialised onto the benchmark
  thread, every major GC lands inside the measured window, and *how many* land
  depends on heap growth, so allocation-heavy tasks land 2–3× apart. Note the
  stable ones are the *heaviest* allocators (`linter` at 458 ms/call) — they
  always pay a large, consistent GC bill, so the variation averages out.

### Can the GC half be fixed by collecting between samples?

That is the obvious follow-up to the `--predictable` split, and it is being
tested (`LAB_GC_PER_SAMPLE`). If every sample starts from a known heap state,
the "how many collections landed in *this* window" term should collapse, which
would make `--predictable`'s near-perfect JIT determinism usable instead of
merely informative.

Costs, measured on the runner: a scavenge is ~130 µs and a full collection
~160 µs. tinybench times only the function, so the collection is excluded from
the sample — but not from wall-clock. The tiny fixtures are what pay: ~12 000
samples × ~130 µs ≈ 1.6 s extra per benchmark, so a scavenge is affordable and a
major collection per sample is the one to watch.

The risk is that it trades one bias for another: a collection immediately before
the sample leaves a compacted, cache-cold heap, so the sample can end up
measuring cache misses that would not normally be there. A scavenge is used
rather than a full collection partly to limit that.

Two arms are queued: `--predictable` + per-sample scavenge (does it rescue the
flag?) and the best allowed flag set + per-sample scavenge (does it improve the
winner?).

So the direction otherwise is: keep `--no-concurrent-recompilation` for the JIT
half, and stabilise the GC half *without* serialising it — pin the young
generation so V8 cannot resize it adaptively, and drop the memory reducer's
background collections.

## Reproducing this

The scaffolding was removed from `platform` when the investigation closed;
`CODSPEED_EXTRA_V8_FLAGS` in `codspeed-node` is the durable part and is all a
re-run needs. `~/cod3036` on the macro runner still holds the harness
(`csrun.sh`, `repeat.sh`, `analyze.py`, `queue.sh`) and every dataset under
`~/cod3036/runs/<label>/`, one subdirectory per repeat.

### Multi-process averaging is blocked downstream

Worth recording because it is the statistically obvious fix and it is *not*
available today. Since the latent variable is per-process, running the suite in
K node processes per CI run would give K independent draws to reduce over.
The plumbing almost works:

- the plugin already writes one `results/<pid>.json` per process
  (`runner-shared/src/walltime_results/mod.rs:19-31`), and the runner's
  `validate_walltime_results` explicitly accepts several files
  (`codspeed/src/executor/wall_time/helpers.rs:15-73`);
- `parse_callgraph` concatenates them into one `benchmarks` array with **no**
  dedup or aggregation
  (`platform/packages/api/src/services/parse_callgraph/src/process_reports/mod.rs:524-537`).

But the duplicate `uri` then reaches
`persistInstrumentResults` → `assertSingleResultPerBenchmark`
(`platform/packages/api/src/core/persistUploadedProfile.ts:39-53`), which
rejects it with the user-facing `MultipleBenchmarkVariations` error ("Found the
same benchmark multiple times in a run, this is not supported yet"). Splitting
across run *parts* does not help either — the same assertion runs again when the
performance report is built.

So a K-process mitigation would need new merge logic at
`process_reports/mod.rs:524-537` (the only place where all K draws are
simultaneously in scope), e.g. reduce same-`uri` entries to the per-`uri`
minimum of `min_ns`. That is a backend change, out of scope here, but it is the
one mitigation that works regardless of root cause.

### Where the change landed

`codspeed-node/packages/core/src/introspection.ts`, `getV8Flags()`, walltime
branch — so **all** walltime users of the plugin get it, not just this repo. The
mechanism is generic to V8, and the plugin already injects far more invasive
flags (`--interpreted-frames-native-stack`, `--allow-natives-syntax`,
`--perf-prof`). `getV8Flags()` also feeds the vitest plugin's `execArgv`
(`packages/vitest-plugin/src/index.ts:67`), so that integration is covered too.

`CODSPEED_EXTRA_V8_FLAGS` is appended last, so any of these can be negated by a
user hitting an unexpected interaction — and it is what made this investigation
possible without republishing the plugin on every attempt.

The only benchmark-side change kept is chunking `MaxHeap churn`
(`platform/libs/shared-utils/benches/maxHeap.bench.ts`).

## Dead ends

Ordered by how plausible they looked going in.

- **Iteration counts, `time`, `iterations`, batching samples via
  `overriddenDuration`.** The intuitive first move and completely wrong: `min`,
  `q1`, `median` and `q3` all move between runs *by the same ratio*, so `min` is
  not an unstable order statistic — it faithfully tracks a process-wide cost
  shift. Estimating a shifted distribution more precisely does not unshift it.
- **`--predictable`.** 18/31, worst 142%. Gives the best JIT determinism measured
  anywhere (0.39% on `linter`) but its implied `--single-threaded` leaves whole
  processes in a pathological major-collection regime, 2–3× apart run to run.
- **Collecting before every sample** (`LAB_GC_PER_SAMPLE`). Does not rescue
  `--predictable` (still 21/31) and is mildly harmful on top of the good flag set
  (7/31 vs 5/31). The `--predictable` failures are whole *processes* in a bad
  regime, not *samples* perturbed by a collection, so per-sample GC cannot touch
  them; and collecting right before a sample leaves a cache-cold heap.
- **GC policy flags** (`--no-memory-reducer`, pinned young generation). Regressed
  the benchmarks that were *most* stable without them (0.64% → 12.69%). Pinning
  the young generation changes promotion behaviour, which is not neutral.
- **`--always-osr`.** Helps when a suite runs alone (`churn` 4.16% → 2.86%, and
  slightly faster) but regressed an allocation-heavy benchmark 0.92% → 11.47% in
  the full suite.
- **Longer warmup** (`warmupTime` 3 s). Real but partial alone (10/31 → 4/31),
  and adds nothing once recompilation is deterministic — while costing ~30% more
  runtime.
- **`--no-interpreted-frames-native-stack`**, cancelling a flag CodSpeed itself
  injects. Mild amplifier, not the cause (7/31).
- **Per-benchmark process isolation.** Rejected on analysis before spending
  machine time: it does not remove the bad draw, it gives each benchmark its own
  independent draw of the same magnitude.
- **Disabling the profiler.** Clean negative control: `baseline-noprof` 7/31 vs
  `baseline` 10/31, and `nocc-noosr-noprof` identical to `nocc-noosr`. samply at
  997 Hz and the `--log-code` writes are not a variance source.
- **ASLR.** Ruled out for free — `/proc/sys/kernel/randomize_va_space` is already
  0 on the macro image.
- **`--no-concurrent-osr`.** No-op; `--concurrent-osr` already defaults to off in
  Node 22's V8.
- **`--no-use-osr` and `--no-maglev`.** Both cut variance (`churn` 11.67% →
  0.67%) and both are disqualified for withholding an optimisation. `--no-use-osr`
  made that benchmark 24% slower — it was measuring worse code, which is exactly
  the error it appeared to fix.
- Hand-rolled `systemd-run` harness that skipped the runner: works, but omits the
  profiler and the introspected V8 flags, so it measures a materially different
  system. Superseded by `codspeed run --profile staging`.
- `codspeed run` refuses to start without a valid token — there is no
  `--skip-upload`, so local iteration needs real credentials.

## Next things to try

In priority order, for whoever picks this up.

1. **Multi-process reduction in the backend.** The one mitigation that works
   regardless of root cause, because the latent variable is per-process. Run the
   suite K times per CI run and reduce same-`uri` results to their minimum at
   `process_reports/mod.rs:524-537`. With a per-process draw of sd ≈ 1.5%, K = 4
   takes the effective spread to well under 2%. Needs the
   `assertSingleResultPerBenchmark` path reworked.
2. **Find out what actually differs in the generated code.** Everything here is
   black-box: configurations in, spreads out. `--trace-opt --trace-deopt` (or the
   `--log-code` output the profiler already collects) diffed between a fast and a
   slow run would name the function and the decision that differs, instead of
   inferring it. That is the missing piece behind the residual 5–7%.
3. **Reconsider the tiny fixtures.** Seven of the seventeen flamegraph fixtures
   are 70–400 µs per call. At that size a single inlining decision is worth 4%,
   and they exist mainly for the deterministic simulation metric. Restricting the
   walltime matrix to the fixtures that are large enough to measure reliably would
   remove most remaining failures honestly, rather than by tuning.
4. **`%OptimizeFunctionOnNextCall`.** `--allow-natives-syntax` is already on and
   `packages/core/src/optimization.ts` already wraps this intrinsic. Forcing the
   benchmark function to be optimised at a fixed point is *more* optimisation, not
   less, so it is within bounds. Untested here because it only pins the top-level
   closure, not the callees where the time is actually spent — but worth trying on
   the hot callees directly.
5. **Raise the threshold for JS walltime, or make it per-benchmark.** If the
   residual per-process draw is irreducible without backend changes, a 5% gate on
   a 70 µs benchmark is not a meaningful signal, and the honest response is to
   stop gating on it.
