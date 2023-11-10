## Testing introspection locally

1. Inside `codspeed-node` directory, run `export PATH="$pwd/../action/dist/bin:$PATH"`.
   This will ensure that the action's `dist/bin/node` file will be used instead of the
   system's `node` binary.

2. Replace the `CodSpeedHQ/action` grep filter with `CodSpeedHQ` in the `dist/bin/node`.
   Since we used `../action` in the `export PATH=...` command, the original grep filter will
   not work.

3. Run your command with the correct flags in `codspeed-node`, for example

```bash
CI=1 CODSPEED_DEBUG=true pnpm --filter vitest-runner bench
```
