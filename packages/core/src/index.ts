import path from "path";

/* eslint-disable @typescript-eslint/no-empty-function */
export interface Measurement {
  isInstrumented(): boolean;
  startMeasurement(): void;
  stopMeasurement(at: string): void;
  isBound: boolean;
}

let m: Measurement;
try {
  m = {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ...require("node-gyp-build")(path.dirname(__dirname)),
    isBound: true,
  } as Measurement;
  console.warn("@codspeed/core binding found");
} catch (e) {
  console.warn("@codspeed/core binding not available on this architecture");
  m = {
    isInstrumented: () => false,
    startMeasurement: () => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    stopMeasurement: (at) => {},
    isBound: false,
  };
}
const measurement = m;
export default measurement;
