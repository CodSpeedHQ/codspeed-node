#include "measurement.h"
#include <valgrind/callgrind.h>

namespace MeasurementModule {

Napi::Boolean IsInstrumented(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  uint depth = RUNNING_ON_VALGRIND;
  return Napi::Boolean::New(env, depth > 0);
}

void StartInstrumentation(const Napi::CallbackInfo &info) {
  CALLGRIND_ZERO_STATS;
  CALLGRIND_START_INSTRUMENTATION;
  return;
}

void StopInstrumentation(const Napi::CallbackInfo &info) {
  CALLGRIND_STOP_INSTRUMENTATION;
  Napi::Env env = info.Env();
  if (info.Length() != 1) {
    Napi::TypeError::New(env, "Wrong number of arguments")
        .ThrowAsJavaScriptException();
    return;
  }
  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "Wrong arguments").ThrowAsJavaScriptException();
    return;
  }

  std::string pos = info[0].As<Napi::String>().Utf8Value();
  CALLGRIND_DUMP_STATS_AT(&pos.c_str()[0]);
  return;
}

Napi::Object Initialize(Napi::Env env, Napi::Object exports) {
  Napi::Object measurementObj = Napi::Object::New(env);

  measurementObj.Set(Napi::String::New(env, "isInstrumented"),
                     Napi::Function::New(env, IsInstrumented));
  measurementObj.Set(Napi::String::New(env, "startInstrumentation"),
                     Napi::Function::New(env, StartInstrumentation));
  measurementObj.Set(Napi::String::New(env, "stopInstrumentation"),
                     Napi::Function::New(env, StopInstrumentation));

  exports.Set(Napi::String::New(env, "Measurement"), measurementObj);

  return exports;
}

} // namespace MeasurementModule