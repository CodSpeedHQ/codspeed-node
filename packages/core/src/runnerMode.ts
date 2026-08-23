export type CodSpeedRunnerMode =
  | "disabled"
  | "simulation"
  | "memory"
  | "walltime";

export type InstrumentMode = "disabled" | "analysis" | "walltime";

export function getCodspeedRunnerMode(): CodSpeedRunnerMode {
  const isCodSpeedEnabled = process.env.CODSPEED_ENV !== undefined;
  if (!isCodSpeedEnabled) {
    return "disabled";
  }

  // If CODSPEED_ENV is set, check CODSPEED_RUNNER_MODE
  const codspeedRunnerMode = process.env.CODSPEED_RUNNER_MODE;
  if (
    codspeedRunnerMode === "instrumentation" ||
    codspeedRunnerMode === "simulation"
  ) {
    return "simulation";
  } else if (codspeedRunnerMode === "memory") {
    return "memory";
  } else if (codspeedRunnerMode === "walltime") {
    return "walltime";
  }

  console.warn(
    `Unknown codspeed runner mode: ${codspeedRunnerMode}, defaulting to disabled`,
  );
  return "disabled";
}

export function getInstrumentMode(): InstrumentMode {
  const runnerMode = getCodspeedRunnerMode();
  // Both "simulation" and "memory" map to "analysis" instrument mode
  if (runnerMode === "simulation" || runnerMode === "memory") {
    return "analysis";
  }
  return runnerMode; // "disabled" or "walltime"
}
