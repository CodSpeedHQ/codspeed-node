const { withCodSpeed } = require("@codspeed/benchmark.js-plugin");
const Benchmark = require("benchmark");

const suite = withCodSpeed(new Benchmark.Suite());

suite
  .add("RegExp#test", function () {
    /o/.test("Hello World!");
  })
  .add("String#indexOf", function () {
    "Hello World!".indexOf("o") > -1;
  })
  // add listeners
  .on("cycle", function (event) {
    console.log(String(event.target));
  })
  // run async
  .run({ async: true });
