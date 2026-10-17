import { withCodSpeed } from "@codspeed/tinybench-plugin";
import { Bench } from "tinybench";

function fibonacci(n: number): number {
  if (n < 2) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const bench = withCodSpeed(new Bench({ time: 100 }));

bench
  .add("switch 1", () => {
    let a = 1;
    let b = 2;
    const c = a;
    a = b;
    b = c;
  })
  .add("switch 2", () => {
    let a = 1;
    let b = 10;
    a = b + a;
    b = a - b;
    a = b - a;
  })
  .add("async fibonacci 15", async () => {
    await Promise.resolve();
    fibonacci(15);
  });

await bench.run();
console.table(bench.table());
