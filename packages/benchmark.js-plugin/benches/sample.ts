import Benchmark from "benchmark";
import { withCodSpeed } from "..";

const suite = withCodSpeed(new Benchmark.Suite());

suite
  .add("RegExp#test", function () {
    /o/.test("Hello World!");
  })
  .add("String#indexOf", function () {
    "Hello World!".indexOf("o") > -1;
  })
  // add listeners
  .on("cycle", function (event: Benchmark.Event) {
    console.log(String(event.target));
  })
  // run async
  .run({ async: true });
