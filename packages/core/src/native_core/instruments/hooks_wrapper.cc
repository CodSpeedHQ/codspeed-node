#include "hooks_wrapper.h"
#include "hooks/includes/core.h"
#include <memory>

namespace codspeed_native {
namespace instruments {
namespace hooks_wrapper {

static InstrumentHooks *hooks = nullptr;

void InitializeGlobal() {
  if (!hooks) {
    hooks = instrument_hooks_init();
  }
}

Napi::Boolean IsInstrumented(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  bool instrumented = instrument_hooks_is_instrumented(hooks);
  return Napi::Boolean::New(env, instrumented);
}

Napi::Number StartBenchmark(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  uint8_t result = instrument_hooks_start_benchmark(hooks);
  return Napi::Number::New(env, result);
}

Napi::Number StopBenchmark(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  uint8_t result = instrument_hooks_stop_benchmark(hooks);
  return Napi::Number::New(env, result);
}

Napi::Number SetExecutedBenchmark(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() != 2) {
    Napi::TypeError::New(env, "Expected 2 arguments: pid and uri")
        .ThrowAsJavaScriptException();
    return Napi::Number::New(env, 1);
  }

  if (!info[0].IsNumber() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected number (pid) and string (uri)")
        .ThrowAsJavaScriptException();
    return Napi::Number::New(env, 1);
  }

  uint32_t pid = info[0].As<Napi::Number>().Uint32Value();
  std::string uri = info[1].As<Napi::String>().Utf8Value();

  uint8_t result =
      instrument_hooks_set_executed_benchmark(hooks, pid, uri.c_str());
  return Napi::Number::New(env, result);
}

Napi::Number SetIntegration(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() != 2) {
    Napi::TypeError::New(env, "Expected 2 arguments: name and version")
        .ThrowAsJavaScriptException();
    return Napi::Number::New(env, 1);
  }

  if (!info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected string (name) and string (version)")
        .ThrowAsJavaScriptException();
    return Napi::Number::New(env, 1);
  }

  std::string name = info[0].As<Napi::String>().Utf8Value();
  std::string version = info[1].As<Napi::String>().Utf8Value();

  uint8_t result =
      instrument_hooks_set_integration(hooks, name.c_str(), version.c_str());
  return Napi::Number::New(env, result);
}

Napi::Object Initialize(Napi::Env env, Napi::Object exports) {
  Napi::Object instrumentHooksObj = Napi::Object::New(env);

  InitializeGlobal();

  instrumentHooksObj.Set(Napi::String::New(env, "isInstrumented"),
                         Napi::Function::New(env, IsInstrumented));
  instrumentHooksObj.Set(Napi::String::New(env, "startBenchmark"),
                         Napi::Function::New(env, StartBenchmark));
  instrumentHooksObj.Set(Napi::String::New(env, "stopBenchmark"),
                         Napi::Function::New(env, StopBenchmark));
  instrumentHooksObj.Set(Napi::String::New(env, "setExecutedBenchmark"),
                         Napi::Function::New(env, SetExecutedBenchmark));
  instrumentHooksObj.Set(Napi::String::New(env, "setIntegration"),
                         Napi::Function::New(env, SetIntegration));

  exports.Set(Napi::String::New(env, "InstrumentHooks"), instrumentHooksObj);

  return exports;
}

} // namespace hooks_wrapper
} // namespace instruments
} // namespace codspeed_native
