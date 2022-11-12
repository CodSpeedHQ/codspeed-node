export interface Measurement {
  isInstrumented(): boolean;
  startMeasurement(): void;
  stopMeasurement(at: string): void;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const measurement = require("bindings")("measurement") as Measurement;
