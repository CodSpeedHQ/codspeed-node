#include "linux_perf/linux_perf.h"
#include "measurement/measurement.h"
#include <napi.h>

namespace codspeed_native {

Napi::Object Initialize(Napi::Env env, Napi::Object exports) {
  codspeed_native::LinuxPerf::Initialize(env, exports);
  codspeed_native::Measurement::Initialize(env, exports);

  return exports;
}

NODE_API_MODULE(native_core, Initialize)

} // namespace codspeed_native
