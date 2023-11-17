import { logDebug } from "@codspeed/core";
import { Bench } from "tinybench";
import { withCodSpeed } from "..";
import parsePr from "./parsePr";

const LONG_BODY =
  new Array(1_000)
    .fill(
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Sunt, earum. Atque architecto vero veniam est tempora fugiat sint quo praesentium quia. Autem, veritatis omnis beatae iste delectus recusandae animi non."
    )
    .join("\n") + "fixes #123";

const bench = withCodSpeed(new Bench({ time: 100 }));

logDebug(`PROCESS PID: ${process.pid} in ${__filename}`);

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
  .add("short body", () => {
    parsePr({ body: "fixes #123", title: "test", number: 124 });
  })
  .add("long body", () => {
    parsePr({ body: LONG_BODY, title: "test", number: 124 });
  });

bench.run().then(() => {
  console.table(bench.table());
});
