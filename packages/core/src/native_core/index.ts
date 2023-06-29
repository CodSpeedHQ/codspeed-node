import path from "path";
import { LinuxPerf } from "./linux_perf/linux_perf";
import { Measurement } from "./measurement/measurement";
interface NativeCore {
  Measurement: Measurement;
  LinuxPerf: typeof LinuxPerf;
}

interface NativeCoreWithBindingStatus extends NativeCore {
  isBound: boolean;
}

let native_core: NativeCoreWithBindingStatus;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nativeCore = require("node-gyp-build")(
    path.dirname(__dirname)
  ) as NativeCore;
  native_core = {
    ...nativeCore,
    isBound: true,
  };
} catch (e) {
  native_core = {
    Measurement: {
      isInstrumented: () => false,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      startInstrumentation: () => {},
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
      stopInstrumentation: (at) => {},
    },
    LinuxPerf: class LinuxPerf {
      start() {
        return false;
      }
      stop() {
        return false;
      }
    },

    isBound: false,
  };
}

export default native_core;
