#ifndef INSTRUMENTS_HOOKS_WRAPPER_H
#define INSTRUMENTS_HOOKS_WRAPPER_H

#include <napi.h>

namespace codspeed_native {
namespace instruments {
namespace hooks_wrapper {

Napi::Boolean IsInstrumented(const Napi::CallbackInfo &info);
Napi::Number StartBenchmark(const Napi::CallbackInfo &info);
Napi::Number StopBenchmark(const Napi::CallbackInfo &info);
Napi::Number SetExecutedBenchmark(const Napi::CallbackInfo &info);
Napi::Number SetIntegration(const Napi::CallbackInfo &info);
Napi::Object Initialize(Napi::Env env, Napi::Object exports);

} // namespace hooks_wrapper
} // namespace instruments
} // namespace codspeed_native

#endif // INSTRUMENTS_HOOKS_WRAPPER_H
