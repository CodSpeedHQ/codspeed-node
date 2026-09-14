<div align="center">
<h1><code>@codspeed/vitest-plugin</code></h1>

[Vitest](https://vitest.dev) plugin for [CodSpeed](https://codspeed.io)

[![CI](https://github.com/CodSpeedHQ/codspeed-node/actions/workflows/ci.yml/badge.svg)](https://github.com/CodSpeedHQ/codspeed-node/actions/workflows/ci.yml)
[![npm (scoped)](https://img.shields.io/npm/v/@codspeed/tinybench-plugin)](https://www.npmjs.com/package/@codspeed/tinybench-plugin)
[![Discord](https://img.shields.io/badge/chat%20on-discord-7289da.svg)](https://discord.com/invite/MxpaCfKSqF)
[![CodSpeed Badge](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json)](https://codspeed.io/CodSpeedHQ/codspeed-node)

</div>

## Documentation

Check out the [documentation](https://docs.codspeed.io/benchmarks/nodejs/vitest)
for complete integration instructions.

## Installation

First, install the plugin
[`@codspeed/vitest-plugin`](https://www.npmjs.com/package/@codspeed/vitest-plugin)
and `vitest` (if not already installed):

> [!NOTE] The CodSpeed plugin is only compatible with
> [vitest@3.2](https://www.npmjs.com/package/vitest/v/3.2.4) and above.

```sh
npm install --save-dev @codspeed/vitest-plugin vitest
```

or with `yarn`:

```sh
yarn add --dev @codspeed/vitest-plugin vitest
```

or with `pnpm`:

```sh
pnpm add --save-dev @codspeed/vitest-plugin vitest
```

## Usage

Let's create a fibonacci function and benchmark it with Vitest's `bench`
fixture:

```ts title="benches/fibo.bench.ts"
import { describe, test } from "vitest";

function fibonacci(n: number): number {
  if (n < 2) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

describe("fibonacci", () => {
  test("depth", async ({ bench }) => {
    await bench.compare(
      bench("fibonacci10", () => {
        fibonacci(10);
      }),
      bench("fibonacci15", () => {
        fibonacci(15);
      }),
    );
  });
});
```

> [!NOTE] The `bench` fixture is a Vitest 5 API. On Vitest 3 and 4, benchmarks
> are declared with the top-level `bench()` export instead:
>
> ```ts
> import { bench, describe } from "vitest";
>
> describe("fibonacci", () => {
>   bench("fibonacci10", () => {
>     fibonacci(10);
>   });
> });
> ```

Create or update your `vitest.config.ts` file to use the CodSpeed runner:

```ts title="vitest.config.ts"
import { defineConfig } from "vitest/config";
import codspeedPlugin from "@codspeed/vitest-plugin";

export default defineConfig({
  plugins: [codspeedPlugin()],
  // ...
});
```

Finally, run your benchmarks (here with `pnpm`):

```bash
$ pnpm vitest bench --run

... Regular `vitest bench` output
```

And... Congrats 🎉, CodSpeed is installed in your benchmarking suite! Locally,
CodSpeed will fallback to vitest since the instrumentation is only available in
the CI environment for now.

You can now
[run those benchmarks in your CI](https://docs.codspeed.io/benchmarks/nodejs/vitest#running-the-benchmarks-in-your-ci)
to continuously get consistent performance measurements.

## Benchmarking in the browser

> [!IMPORTANT] Browser benchmarks need Vitest 5 and the
> [playwright provider](https://vitest.dev/guide/browser/playwright), and are
> measured in Chromium only.

Benchmarks declared with `bench` from `@codspeed/vitest-plugin/browser` run in
the page, so what is measured is the real thing: your components, your
framework, and the browser's own work, profiled in the renderer process.

```tsx title="benches/todoList.bench.tsx"
import { bench } from "@codspeed/vitest-plugin/browser";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { TodoList } from "../src/todoList";

const container = document.body.appendChild(document.createElement("div"));
const root = createRoot(container);

bench("render 400 rows", () => {
  flushSync(() => {
    root.render(<TodoList todos={todos} />);
  });
});
```

The browser has to be launched with the V8 flags the profiler needs, which
`codspeedLaunchOptions()` provides:

```ts title="vitest.config.ts"
import codspeedPlugin, { codspeedLaunchOptions } from "@codspeed/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: codspeedLaunchOptions() }),
      instances: [{ browser: "chromium" }],
    },
  },
});
```

`bench(name, fn, options)` takes `warmupIterations`, `rounds` (walltime only:
analysis always measures a single round), `setup` and `teardown`. The file is
collected by `benchmark.include` like any other benchmark file, so
`vitest bench` runs it, and with no instrument attached it still runs the
function and reports its duration.

### Benchmarking a framework in production mode

Vitest serves the page through the Vite dev server, so a framework that branches
on `process.env.NODE_ENV` runs its development build, whose bookkeeping then
dominates the profile. Point the project at the production build instead, in the
dependency pre-bundle too, as it is built before `define` applies:

```ts title="vitest.config.ts"
const productionDefine = {
  "process.env.NODE_ENV": JSON.stringify("production"),
};

export default defineConfig({
  define: productionDefine,
  optimizeDeps: {
    rolldownOptions: { transform: { define: productionDefine } },
  },
  resolve: { conditions: ["module", "browser", "production"] },
  oxc: { jsx: { runtime: "automatic", development: false } },
  // ...
});
```

A runnable version of this setup lives in
[`examples/with-vitest-browser`](../../examples/with-vitest-browser).
