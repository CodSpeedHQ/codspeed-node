// Importing the core registers the OpenTelemetry providers, which must happen
// before the benchmark files get their tracers and loggers. Vitest imports the
// setup files ahead of each test file, in the worker running it.
import "@codspeed/core";
