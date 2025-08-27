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
      setExecutedBenchmark: (_pid: number, _uri: string) => {
        return 0;
      },
      setIntegration: (_name: string, _version: string) => {
        return 0;
      },
    },
    isBound: false,
  };
}

export default native_core;
