#include "linux_perf/linux_perf.h"
#include "measurement/measurement.h"
#include <napi.h>

Napi::Object Initialize(Napi::Env env, Napi::Object exports) {
  LinuxPerf::Initialize(env, exports);
  MeasurementModule::Initialize(env, exports);

  return exports;
}

NODE_API_MODULE(native_core, Initialize)