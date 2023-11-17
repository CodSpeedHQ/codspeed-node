<div align="center">
<h1><code>@codspeed/tinybench-plugin</code></h1>

tinybench compatibility layer for CodSpeed

[![CI](https://github.com/CodSpeedHQ/codspeed-node/actions/workflows/ci.yml/badge.svg)](https://github.com/CodSpeedHQ/codspeed-node/actions/workflows/ci.yml)
[![npm (scoped)](https://img.shields.io/npm/v/@codspeed/tinybench-plugin)](https://www.npmjs.com/package/@codspeed/tinybench-plugin)
[![Discord](https://img.shields.io/badge/chat%20on-discord-7289da.svg)](https://discord.com/invite/MxpaCfKSqF)
[![CodSpeed Badge](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json)](https://codspeed.io/CodSpeedHQ/codspeed-node)

</div>

## Documentation

Check out the [documentation](https://docs.codspeed.io/benchmarks/nodejs) for complete integration instructions.

## Installation

First install the plugin [`@codspeed/tinybench-plugin`](https://www.npmjs.com/package/@codspeed/tinybench-plugin) and `tinybench` (if not already installed):

```sh
npm install --save-dev @codspeed/tinybench-plugin tinybench
```

or with `yarn`:

```sh
yarn add --dev @codspeed/tinybench-plugin tinybench
```

or with `pnpm`:

```sh
pnpm add --save-dev @codspeed/tinybench-plugin tinybench
```

## Usage

Let's create a fibonacci function and benchmark it with tinybench and the CodSpeed plugin:

```js title="benches/bench.mjs"
import { Bench } from "tinybench";
import { withCodSpeed } from "@codspeed/tinybench-plugin";

function fibonacci(n) {
  if (n < 2) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const bench = withCodSpeed(new Bench());

bench
  .add("fibonacci10", () => {
    fibonacci(10);
  })
  .add("fibonacci15", () => {
    fibonacci(15);
  });

await bench.run();
console.table(bench.table());
```

Here, a few things are happening:

- We create a simple recursive fibonacci function.
- We create a new `Bench` instance with CodSpeed support by using the **`withCodSpeed`** helper. This step is **critical** to enable CodSpeed on your benchmarks.

- We add two benchmarks to the suite and launch it, benching our `fibonacci` function for 10 and 15.

Now, we can run our benchmarks locally to make sure everything is working as expected:

```sh
$ node benches/bench.mjs
[CodSpeed] 2 benches detected but no instrumentation found
[CodSpeed] falling back to tinybench

┌─────────┬───────────────┬─────────────┬───────────────────┬──────────┬─────────┐
│ (index) │   Task Name   │   ops/sec   │ Average Time (ns) │  Margin  │ Samples │
├─────────┼───────────────┼─────────────┼───────────────────┼──────────┼─────────┤
│    0    │ 'fibonacci10' │ '1,810,236' │ 552.4139857896414 │ '±0.18%' │ 905119  │
│    1    │ 'fibonacci15' │  '177,516'  │ 5633.276191749634 │ '±0.14%' │  88759  │
└─────────┴───────────────┴─────────────┴───────────────────┴──────────┴─────────┘
```

And... Congrats🎉, CodSpeed is installed in your benchmarking suite! Locally, CodSpeed will fallback to tinybench since the instrumentation is only available in the CI environment for now.

You can now [run those benchmark in your CI](https://docs.codspeed.io/benchmarks/nodejs#running-the-benchmarks-in-your-ci) to continuously get consistent performance measurements.
