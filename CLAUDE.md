# CodSpeed Node Repository Layout

## Repository Structure

This is a monorepo containing CodSpeed plugins for various Node.js benchmarking frameworks.

### Root Level
- `package.json` - Root package configuration
- `pnpm-workspace.yaml` - PNPM workspace configuration
- `lerna.json` - Lerna monorepo configuration
- `tsconfig.base.json` - Base TypeScript configuration
- `rollup.options.js` - Rollup bundler configuration
- `scripts/` - Build and release scripts
- `docs/` - Documentation files
- `examples/` - Example projects using the plugins

### Packages (`packages/`)

#### Core Package (`packages/core/`)
- **Purpose**: Core measurement and instrumentation functionality
- **Key files**:
  - `src/index.ts` - Main exports, setupCore/teardownCore functions
  - `src/mongoMeasurement.ts` - MongoDB measurement handling
  - `src/optimization.ts` - Function optimization utilities
  - `src/native_core/` - Native C++ bindings for performance measurement
  - `src/introspection.ts` - V8 flags and runtime introspection

#### Tinybench Plugin (`packages/tinybench-plugin/`)
- **Purpose**: CodSpeed integration for tinybench framework
- **Key files**:
  - `src/index.ts` - Main plugin implementation with `withCodSpeed()` function
  - `tests/index.integ.test.ts` - Integration tests
  - `benches/` - Benchmark examples

#### Benchmark.js Plugin (`packages/benchmark.js-plugin/`)
- **Purpose**: CodSpeed integration for benchmark.js framework
- **Key files**:
  - `src/index.ts` - Main plugin implementation
  - `src/buildSuiteAdd.ts` - Suite building utilities

#### Vitest Plugin (`packages/vitest-plugin/`)
- **Purpose**: CodSpeed integration for Vitest framework
- **Key files**:
  - `src/index.ts` - Main plugin implementation
  - `src/runner.ts` - Custom test runner
  - `src/globalSetup.ts` - Global setup configuration

### Examples Directory (`examples/`)
- `with-javascript-cjs/` - CommonJS JavaScript examples
- `with-javascript-esm/` - ESM JavaScript examples
- `with-typescript-cjs/` - CommonJS TypeScript examples
- `with-typescript-esm/` - ESM TypeScript examples
- `with-typescript-simple-cjs/` - Simple CommonJS TypeScript examples
- `with-typescript-simple-esm/` - Simple ESM TypeScript examples

## Tinybench Plugin Architecture

### Current Stats/Measurements Access

The tinybench plugin currently has **limited stats exposure**:

1. **No direct stats API**: The `withCodSpeed()` function wraps a tinybench instance but doesn't expose measurement results
2. **Console-only output**: Results are only printed to console via `console.log()`
3. **Core measurement**: Uses `@codspeed/core` for actual measurement via:
   - `mongoMeasurement.start(uri)` / `mongoMeasurement.stop(uri)`
   - `Measurement.startInstrumentation()` / `Measurement.stopInstrumentation(uri)`

### Current Workflow
1. User calls `withCodSpeed(new Bench())` to wrap their tinybench instance
2. Plugin intercepts `bench.run()` to add CodSpeed instrumentation
3. Each benchmark task runs with measurement instrumentation
4. Results are logged to console but not returned as structured data

### Key Functions in tinybench plugin
- `withCodSpeed(bench: Bench): Bench` - Main wrapper function
- `setupInstruments(body)` - Dynamic instrument setup
- `getCallingFile()` - Helper to generate unique URIs for benchmarks

## Potential Enhancement Areas

Based on the codebase analysis, to add stats access features:

1. **Extend return value**: Modify `bench.run()` to return structured measurement data
2. **Add stats methods**: Add methods like `getStats()`, `getResults()`, `getLastRunStats()`
3. **Integrate with core**: Leverage `@codspeed/core` measurement data
4. **Maintain tinybench compatibility**: Ensure existing `bench.table()` still works

## Repository Management Memories

- Use pnpm instead of npm
- To run tests in a package use moon <package-name>:test