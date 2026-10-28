import { appendFileSync } from "node:fs";
import { bench } from "vitest";

// Smoke checks record each process's calls per task and phase, to verify
// the budgets below.
const countFile = process.env.MATRIX_COUNT_FILE;
let calls = 0;

// Budget mode: the tinybench 2.9 defaults (warmup 100 ms / 5 calls, measured
// 500 ms / 10 rounds) scaled by MATRIX_BUDGET. Otherwise exact iteration
// budgets; tinybench makes one warmup call more than `warmupIterations`.
const budget = process.env.MATRIX_BUDGET;
const k = Number(budget);
const options = {
  ...(budget
    ? {
        time: 500 * k,
        iterations: Math.ceil(10 * k),
        warmupTime: 100 * k,
        warmupIterations: Math.ceil(5 * k),
      }
    : {
        time: 0,
        iterations: Number(process.env.MATRIX_MEASURE),
        warmupTime: 0,
        warmupIterations: Number(process.env.MATRIX_WARMUP),
      }),
  ...(countFile && {
    teardown: (task: { name: string } | undefined, mode: string) => {
      appendFileSync(countFile, `${process.pid} ${task?.name} ${mode} ${calls}\n`);
      calls = 0;
    },
  }),
};

let sink: unknown;

function fib(n: number): number {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

const json = JSON.stringify(
  Array.from({ length: 5000 }, (_, i) => ({
    id: i,
    name: `record-${i}`,
    values: [i, i + 1, i + 2],
  })),
);

bench(
  "cpu",
  () => {
    calls++;
    sink = fib(26);
  },
  options,
);

bench(
  "json",
  () => {
    calls++;
    sink = JSON.parse(json);
  },
  options,
);

bench(
  "allocation",
  () => {
    calls++;
    const rows = Array.from({ length: 30000 }, (_, i) => ({
      key: (i * 7919) % 30000,
      value: `item-${i}`,
    }));
    rows.sort((a, b) => a.key - b.key);
    sink = rows;
  },
  options,
);

export { sink };
