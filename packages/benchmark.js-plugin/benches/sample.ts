import Benchmark from "benchmark";
import { withCodSpeed } from "..";
import parsePr from "./parsePr";

const LONG_BODY =
  new Array(1_000)
    .fill(
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Sunt, earum. Atque architecto vero veniam est tempora fugiat sint quo praesentium quia. Autem, veritatis omnis beatae iste delectus recusandae animi non."
    )
    .join("\n") + "fixes #123";

const suite = withCodSpeed(new Benchmark.Suite());

console.log(`PROCESS PID: ${process.pid} in ${__filename}`);

suite
  .add("RegExp#test", function () {
    /o/.test("Hello World!");
  })
  .add("String#indexOf", function () {
    "Hello World!".indexOf("o") > -1;
  })
  .add("short body", () => {
    parsePr({ body: "fixes #123", title: "test", number: 124 });
  })
  .add("long body", () => {
    parsePr({ body: LONG_BODY, title: "test", number: 124 });
  })
  .add("short body 2", () => {
    parsePr({ body: "fixes #123", title: "test", number: 124 });
  })
  .add("short body 3", () => {
    parsePr({ body: "fixes #123", title: "test", number: 124 });
  })
  .add("short body 4", () => {
    parsePr({ body: "fixes #123", title: "test", number: 124 });
  })
  .add("short body 5", () => {
    parsePr({ body: "fixes #123", title: "test", number: 124 });
  })
  // add listeners
  .on("cycle", function (event: Benchmark.Event) {
    console.log(String(event.target));
  })
  // run async
  .run({ async: true });
