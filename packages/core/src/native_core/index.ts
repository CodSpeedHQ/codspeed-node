import path from "path";
import { InstrumentHooks } from "./instruments/hooks";
import { LinuxPerf } from "./linux_perf/linux_perf";
interface NativeCore {
  InstrumentHooks: InstrumentHooks;
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
    LinuxPerf: class LinuxPerf {
      start() {
        return false;
      }
      stop() {
        return false;
      }
    },
    InstrumentHooks: {
      isInstrumented: () => {
        return false;
      },
      startBenchmark: () => {
        return 0;
      },
      stopBenchmark: () => {
        return 0;
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setExecutedBenchmark: (_pid: number, _uri: string) => {
        return 0;
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setIntegration: (_name: string, _version: string) => {
        return 0;
      },
      __codspeed_root_frame__: <T>(callback: () => T): T => {
        return callback();
      },
    },
    isBound: false,
  };
}

export default native_core;
