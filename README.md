<div align="center">
<h1>codspeed-node</h1>

Node.js libraries to create CodSpeed benchmarks

[![CI](https://github.com/CodSpeedHQ/codspeed-node/actions/workflows/ci.yml/badge.svg)](https://github.com/CodSpeedHQ/codspeed-node/actions/workflows/ci.yml)
[![npm (scoped)](https://img.shields.io/npm/v/@codspeed/core)](https://www.npmjs.com/org/codspeed)
[![Discord](https://img.shields.io/badge/chat%20on-discord-7289da.svg)](https://discord.com/invite/MxpaCfKSqF)
[![CodSpeed Badge](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json)](https://codspeed.io/CodSpeedHQ/codspeed-node)

</div>

## Documentation

Check out the [documentation](https://docs.codspeed.io/benchmarks/nodejs) for complete integration instructions.

## Packages

This mono-repo contains the integration packages for using CodSpeed with Node.js:

- [`@codspeed/tinybench-plugin`](./packages/tinybench-plugin): tinybench compatibility layer for CodSpeed
- [`@codspeed/benchmark.js-plugin`](./packages/benchmark.js-plugin): Benchmark.js compatibility layer for CodSpeed
- [`@codspeed/core`](./packages/core): The core library used to integrate with Codspeed runners
