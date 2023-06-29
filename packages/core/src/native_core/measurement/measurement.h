#ifndef MEASUREMENT_H
#define MEASUREMENT_H

#include <napi.h>

namespace codspeed_native {
namespace Measurement {

Napi::Boolean IsInstrumented(const Napi::CallbackInfo &info);
void StartInstrumentation(const Napi::CallbackInfo &info);
void StopInstrumentation(const Napi::CallbackInfo &info);
Napi::Object Initialize(Napi::Env env, Napi::Object exports);

} // namespace Measurement
} // namespace codspeed_native

#endif // MEASUREMENT_H
