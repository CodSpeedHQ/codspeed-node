/**
 * Number of fresh processes that each walltime benchmark runs in, whose rounds
 * are reported together. Unset: the benchmark runs in the benchmark process.
 */
export const WALLTIME_FORKS_ENV = "CODSPEED_WALLTIME_FORKS";
/** When `true`, a full GC runs before every walltime round, outside its timing. */
export const WALLTIME_GC_BETWEEN_ROUNDS_ENV =
  "CODSPEED_WALLTIME_GC_BETWEEN_ROUNDS";

/**
 * Share of a benchmark's warmup and measurement budget (time and rounds) that
 * each fork runs when there are several forks. Every fork pays the process
 * startup anyway, so full budgets would make F forks cost F full runs.
 */
export const FORK_BUDGET_FRACTION = 0.5;

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
