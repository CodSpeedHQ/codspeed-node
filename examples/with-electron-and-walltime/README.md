# mail-client benchmarks

A TypeScript mail-client backend-for-frontend with a small Electron client on top, instrumented with [CodSpeed](https://codspeed.io) so the performance-sensitive surface (search, threading, bulk mutations, persistence) is benchmarked in CI.

## Why

Mail clients have a strict performance bar — every interaction needs to feel instant. This repo isolates the data-and-state layer of such a client, benchmarks its hot paths in walltime and memory mode, and exercises the same code from an Electron renderer so the user-facing impact of a code change is visible alongside the CodSpeed numbers.

## Stack

- **TypeScript** on Node.js `24.11.1` (pinned via `package.json` `engines`).
- **pnpm workspaces** — model, electron app, and benches live as separate packages.
- Two benchmark-authoring paths, both with first-class CodSpeed support:
  - **vitest** `bench()` + **`@codspeed/vitest-plugin`** — declarative, sits next to test suites.
  - **tinybench** + **`@codspeed/tinybench-plugin`** — standalone scripts, fine-grained control.
- **electron-vite** + **vanilla TS** for the client — minimal renderer code, straightforward to profile.

## Layout

```
packages/
  model/                 @mail-client-demo/model
    src/                 Email, Inbox, seed generator, store + persistence
    bench/               vitest benchmarks
apps/
  electron/              @mail-client-demo/electron
    src/main/            Electron main process — owns the AppState + IPC
    src/preload/         contextBridge for the renderer
    src/renderer/        vanilla TS inbox UI
```

## Run

```bash
pnpm install
pnpm electron            # launch the Electron client (dev mode)
pnpm bench               # local wall-clock benches
pnpm bench:codspeed      # instrumented run (walltime), uploads to CodSpeed
pnpm typecheck           # typecheck all workspace packages
```

## CI

This example is benchmarked in CI by the repository-root
`.github/workflows/codspeed-electron-example.yml` workflow, which runs the
Electron inbox e2e on the CodSpeed macro runner, with OIDC auth (no static token
required).

To benchmark the model package (walltime/memory) locally, use the `bench` and
`bench:codspeed` scripts described above.
