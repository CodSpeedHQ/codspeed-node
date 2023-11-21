<div align="center">
<h1><code>@codspeed/benchmark.js-plugin</code></h1>

Benchmark.js compatibility layer for CodSpeed

[![CI](https://github.com/CodSpeedHQ/codspeed-node/actions/workflows/ci.yml/badge.svg)](https://github.com/CodSpeedHQ/codspeed-node/actions/workflows/ci.yml)
[![npm (scoped)](https://img.shields.io/npm/v/@codspeed/benchmark.js-plugin)](https://www.npmjs.com/package/@codspeed/benchmark.js-plugin)
[![Discord](https://img.shields.io/badge/chat%20on-discord-7289da.svg)](https://discord.com/invite/MxpaCfKSqF)
[![CodSpeed Badge](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json)](https://codspeed.io/CodSpeedHQ/codspeed-node)

</div>

## Documentation

Check out the [documentation](https://docs.codspeed.io/benchmarks/nodejs/benchmark.js) for complete integration instructions.

## Installation

First, install the plugin [`@codspeed/benchmark.js-plugin`](https://www.npmjs.com/package/@codspeed/benchmark.js-plugin) and `benchmark.js` (if not already installed):

```sh
npm install --save-dev @codspeed/benchmark.js-plugin benchmark.js
```

or with `yarn`:

```sh
yarn add --dev @codspeed/benchmark.js-plugin benchmark.js
```

or with `pnpm`:

```sh
pnpm add --save-dev @codspeed/benchmark.js-plugin benchmark.js
```

## Usage

Let's create a fibonacci function and benchmark it with benchmark.js and the CodSpeed plugin:

```js title="benches/bench.mjs"
import Benchmark from "benchmark";
import { withCodSpeed } from "@codspeed/benchmark.js-plugin";

function fibonacci(n) {
  if (n < 2) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const suite = withCodSpeed(new Benchmark.Suite());

suite
  .add("fibonacci10", () => {
    fibonacci(10);
  })
  .add("fibonacci15", () => {
    fibonacci(15);
  })
  .on("cycle", function (event: Benchmark.Event) {
    console.log(String(event.target));
  })
  .run();
```

Here, a few things are happening:

- We create a simple recursive fibonacci function.
- We create a new `Benchmark.Suite` instance with CodSpeed support by using the **`withCodSpeed`** helper. This step is **critical** to enable CodSpeed on your benchmarks.
- We add two benchmarks to the suite and launch it, benching our `fibonacci` function with 10 and 15.

Now, we can run our benchmarks locally to make sure everything is working as expected:

```sh
$ node benches/bench.mjs
[CodSpeed] 2 benches detected but no instrumentation found
[CodSpeed] falling back to benchmark.js

fibonacci10 x 2,155,187 ops/sec ±0.50% (96 runs sampled)
fibonacci15 x 194,742 ops/sec ±0.48% (95 runs sampled)
```

And... Congrats🎉, CodSpeed is installed in your benchmarking suite! Locally, CodSpeed will fallback to tinybench since the instrumentation is only available in the CI environment for now.

You can now [run those benchmarks in your CI](https://docs.codspeed.io/benchmarks/nodejs/benchmark.js#running-the-benchmarks-in-your-ci) to continuously get consistent performance measurements.
