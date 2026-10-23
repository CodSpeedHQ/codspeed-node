/**
 * Number of fresh processes that each walltime benchmark runs in, whose rounds
 * are reported together. Unset: the benchmark runs in the benchmark process.
 */
export const WALLTIME_FORKS_ENV = "CODSPEED_WALLTIME_FORKS";
/** When `true`, a full GC runs before every walltime round, outside its timing. */
export const WALLTIME_GC_BETWEEN_ROUNDS_ENV =
  "CODSPEED_WALLTIME_GC_BETWEEN_ROUNDS";
/** Space-separated V8 flags appended to the walltime benchmark processes. */
export const WALLTIME_V8_FLAGS_ENV = "CODSPEED_WALLTIME_V8_FLAGS";

export function getExtraWalltimeV8Flags(): string[] {
  return (process.env[WALLTIME_V8_FLAGS_ENV] ?? "")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Minimum measured time per walltime benchmark, in milliseconds: rounds
 * continue past the configured iterations until it is reached.
 */
export const WALLTIME_MIN_TIME_MS_ENV = "CODSPEED_WALLTIME_MIN_TIME_MS";

/** The minimum measured time in milliseconds, `0` when unset. */
export function getWalltimeMinTimeMs(): number {
  const value = process.env[WALLTIME_MIN_TIME_MS_ENV];
  if (value === undefined || value === "") {
    return 0;
  }
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error(
      `${WALLTIME_MIN_TIME_MS_ENV} must be a non-negative number, got \`${value}\``,
    );
  }
  return ms;
}

/** The number of forks per walltime benchmark, or `undefined` for none. */
export function getWalltimeForks(): number | undefined {
  const value = process.env[WALLTIME_FORKS_ENV];
  if (value === undefined || value === "") {
    return undefined;
  }
  const forks = Number(value);
  if (!Number.isInteger(forks) || forks < 1) {
    throw new Error(
      `${WALLTIME_FORKS_ENV} must be a positive integer, got \`${value}\``,
    );
  }
  return forks;
}

export function isGcBetweenRoundsEnabled(): boolean {
  const value = process.env[WALLTIME_GC_BETWEEN_ROUNDS_ENV];
  switch (value) {
    case undefined:
    case "":
    case "0":
    case "false":
      return false;
    case "1":
    case "true":
      return true;
    default:
      throw new Error(
        `${WALLTIME_GC_BETWEEN_ROUNDS_ENV} must be \`true\` or \`false\`, got \`${value}\``,
      );
  }
}

/**
 * Runs a full GC. Only valid when GC between rounds is enabled, which adds
 * `--expose-gc` to the V8 flags.
 */
export function collectGarbage(): void {
  if (global.gc === undefined) {
    throw new Error(
      `[CodSpeed] ${WALLTIME_GC_BETWEEN_ROUNDS_ENV} needs the --expose-gc V8 flag`,
    );
  }
  global.gc();
}
