<div align="center">
<h1><code>@codspeed/playwright-plugin</code></h1>

[Playwright](https://playwright.dev) integration for [CodSpeed](https://codspeed.io), to drive an app through Playwright and report measured user flows.

[![CI](https://github.com/CodSpeedHQ/codspeed-node/actions/workflows/ci.yml/badge.svg)](https://github.com/CodSpeedHQ/codspeed-node/actions/workflows/ci.yml)
[![npm (scoped)](https://img.shields.io/npm/v/@codspeed/playwright-plugin)](https://www.npmjs.com/package/@codspeed/playwright-plugin)
[![Discord](https://img.shields.io/badge/chat%20on-discord-7289da.svg)](https://discord.com/invite/MxpaCfKSqF)
[![CodSpeed Badge](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json)](https://codspeed.io/CodSpeedHQ/codspeed-node)

</div>

> [!NOTE]
> The `@codspeed/playwright-plugin` integration currently supports only the
> [walltime instrument](https://docs.codspeed.io/instruments/walltime). CPU
> Simulation is not available.

`@codspeed/playwright-plugin` is the CodSpeed integration for
[Playwright](https://playwright.dev). It runs a user-defined flow against a
target application, measures the time spent inside that flow, and reports it to
CodSpeed. The flow itself is plain Playwright code, so anything Playwright can
drive can be benchmarked.

> [!IMPORTANT]
> Today the plugin supports [Electron](https://www.electronjs.org) apps as a
> target. Browser-based targets (existing dev servers, static builds, hosted
> URLs) are on the roadmap and will be added under the same `bench` API.

## Documentation

Check out the [documentation](https://docs.codspeed.io/benchmarks/nodejs/playwright) for complete integration instructions.

## Installation

Install the plugin alongside `playwright`:

```sh
npm install --save-dev @codspeed/playwright-plugin playwright
```

or with `yarn`:

```sh
yarn add --dev @codspeed/playwright-plugin playwright
```

or with `pnpm`:

```sh
pnpm add --save-dev @codspeed/playwright-plugin playwright
```

## Example usage with Electron

Build your Electron app first so the main entrypoint exists (e.g.,
`out/main/index.js`), then declare a benchmark with `target.kind` set to
`"electron"`:

```ts title="bench/inbox.bench.ts"
import { bench } from "@codspeed/playwright-plugin";
import path from "node:path";

bench(
  "inbox-search",
  async ({ page }) => {
    await page.fill("#search", "quarterly report");
    await page.waitForSelector("#results");
  },
  {
    target: {
      kind: "electron",
      appPath: path.resolve("out/main/index.js"),
    },
    beforeRound: async ({ page }) => {
      await page.waitForSelector("#main:not(.loading)");
    },
    rounds: 5,
  },
);
```

For each round, the plugin launches Electron with the provided main entrypoint,
waits for the first window, runs `beforeRound`, measures `fn`, runs
`afterRound`, then closes the app.

## API

The plugin exposes a single `bench` function. Its shape is target-agnostic:

```ts
import { bench } from "@codspeed/playwright-plugin";

bench(name, fn, options);
```

| Argument  | Type                                  | Required | Description                                                                                                                                                                                              |
| --------- | ------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`    | `string`                              | yes      | Identifier of the benchmark, used by CodSpeed to track it across runs.                                                                                                                                   |
| `fn`      | `({ page }) => void \| Promise<void>` | yes      | The function whose execution time is measured. Receives a Playwright [`Page`](https://playwright.dev/docs/api/class-page) bound to the target. Everything inside `fn` counts toward the reported timing. |
| `options` | `BenchOptions`                        | yes      | Target configuration and benchmark settings, detailed below.                                                                                                                                             |

### Options

| Option        | Type                                  | Default      | Description                                                                                                                                                                                                   |
| ------------- | ------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`      | `Target`                              | _(required)_ | Discriminated union describing what to drive. The `kind` field selects the target; the remaining fields are specific to that kind. Current variants: [`{ kind: "electron", ... }`](#electron-target-options). |
| `rounds`      | `number`                              | `1`          | Number of measurement rounds. Can be overridden at runtime via the `CODSPEED_PLAYWRIGHT_ROUNDS` environment variable.                                                                                         |
| `beforeRound` | `({ page }) => void \| Promise<void>` | —            | Runs before each round, after the target is ready. Use it to bring the app to a ready state. Not measured.                                                                                                    |
| `afterRound`  | `({ page }) => void \| Promise<void>` | —            | Runs after each round, before the target is torn down. Not measured.                                                                                                                                          |

### Electron target options

| Option                          | Type         | Default             | Description                                                                                                                                 |
| ------------------------------- | ------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `target.kind`                   | `"electron"` | _(required)_        | Selects the Electron target.                                                                                                                |
| `target.appPath`                | `string`     | _(required)_        | Absolute path to the Electron main entrypoint, e.g., `out/main/index.js`.                                                                   |
| `target.electronArgs`           | `string[]`   | `[]`                | Extra CLI flags forwarded to the Electron process.                                                                                          |
| `target.cwd`                    | `string`     | `process.cwd()`     | Working directory for the Electron process. Also the directory `electron` is resolved from when `target.electronExecutablePath` is not set. |
| `target.electronExecutablePath` | `string`     | resolved `electron` | Absolute path to the Electron binary. Only set this to override the default resolution.                                                     |

## Running the benchmarks locally

With node 24+, you can run typescript files directly:

```bash
$ node bench/inbox.bench.ts
[CodSpeed] [round 1/5] 42.13 ms
[CodSpeed] [round 2/5] 41.78 ms
[CodSpeed] [round 3/5] 42.05 ms
[CodSpeed] [round 4/5] 41.92 ms
[CodSpeed] [round 5/5] 42.21 ms
```

Locally, `bench` runs the app and prints per-round timings to the terminal.
Results are uploaded to CodSpeed only when running in the
[CI environment](https://docs.codspeed.io/benchmarks/nodejs/playwright#running-the-benchmarks-in-your-ci)
or when using the
[CodSpeed CLI](https://docs.codspeed.io/cli#running-benchmarks).
