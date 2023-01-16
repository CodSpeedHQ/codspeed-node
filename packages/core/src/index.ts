export interface Measurement {
  isInstrumented(): boolean;
  startMeasurement(): void;
  stopMeasurement(at: string): void;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const measurement = require("bindings")("measurement.node") as Measurement;

export default measurement;
