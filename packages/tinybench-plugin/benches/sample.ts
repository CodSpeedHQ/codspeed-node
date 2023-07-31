import { Bench } from "tinybench";
import { withCodSpeed } from "..";

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
  });

bench.run().then(() => {
  console.table(bench.table());
});
