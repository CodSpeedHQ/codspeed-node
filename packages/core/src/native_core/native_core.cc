#include "linux_perf/linux_perf.h"
#include "instruments/hooks_wrapper.h"
#include <napi.h>

namespace codspeed_native {

Napi::Object Initialize(Napi::Env env, Napi::Object exports) {
  codspeed_native::LinuxPerf::Initialize(env, exports);
  codspeed_native::instruments::hooks_wrapper::Initialize(env, exports);

  return exports;
}

NODE_API_MODULE(native_core, Initialize)

} // namespace codspeed_native
