## Analysis-mode V8 flags

Simulation (including the `instrumentation` alias) and memory mode use
`--always-sparkplug` to compile eligible JavaScript functions directly to baseline
machine code instead of waiting for V8's tiering and batch-compilation thresholds.
This reduces sensitivity to unrelated code triggering compilation before a
benchmark is measured. TurboFan remains disabled with `--no-opt`, and Maglev is
explicitly disabled on Node.js 24 and newer.

This changes the measurement baseline compared with earlier releases. It does not
isolate inline-cache feedback from other benchmarks. Walltime flags are unchanged.

## Testing introspection locally

1. Inside `codspeed-node` directory, run `export PATH="$pwd/../action/dist/bin:$PATH"`.
   This will ensure that the action's `dist/bin/node` file will be used instead of the
   system's `node` binary.

2. Replace the `CodSpeedHQ/action` grep filter with `CodSpeedHQ` in the `dist/bin/node`.
   Since we used `../action` in the `export PATH=...` command, the original grep filter will
   not work.

3. Run your command with the correct flags in `codspeed-node`, for example

```bash
CI=1 CODSPEED_DEBUG=true pnpm --filter with-typescript-esm bench-tinybench
```
