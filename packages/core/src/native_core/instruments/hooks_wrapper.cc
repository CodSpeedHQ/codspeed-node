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

  int32_t pid = info[0].As<Napi::Number>().Int32Value();
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

Napi::Number SetEnvironment(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() != 3) {
    Napi::TypeError::New(
        env, "Expected 3 arguments: sectionName, key, and value")
        .ThrowAsJavaScriptException();
    return Napi::Number::New(env, 1);
  }

  if (!info[0].IsString() || !info[1].IsString() || !info[2].IsString()) {
    Napi::TypeError::New(
        env,
        "Expected string (sectionName), string (key), and string (value)")
        .ThrowAsJavaScriptException();
    return Napi::Number::New(env, 1);
  }

  std::string section_name = info[0].As<Napi::String>().Utf8Value();
  std::string key = info[1].As<Napi::String>().Utf8Value();
  std::string value = info[2].As<Napi::String>().Utf8Value();

  uint8_t result = instrument_hooks_set_environment(
      hooks, section_name.c_str(), key.c_str(), value.c_str());
  return Napi::Number::New(env, result);
}

Napi::Number WriteEnvironment(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() != 1) {
    Napi::TypeError::New(env, "Expected 1 argument: pid")
        .ThrowAsJavaScriptException();
    return Napi::Number::New(env, 1);
  }

  if (!info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected number (pid)")
        .ThrowAsJavaScriptException();
    return Napi::Number::New(env, 1);
  }

  int32_t pid = info[0].As<Napi::Number>().Int32Value();

  uint8_t result = instrument_hooks_write_environment(hooks, pid);
  return Napi::Number::New(env, result);
}

Napi::BigInt CurrentTimestamp(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  uint64_t ts = instrument_hooks_current_timestamp();
  return Napi::BigInt::New(env, ts);
}

Napi::Number AddMarker(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() != 3) {
    Napi::TypeError::New(env,
                         "Expected 3 arguments: pid, markerType, timestamp")
        .ThrowAsJavaScriptException();
    return Napi::Number::New(env, 1);
  }

  if (!info[0].IsNumber() || !info[1].IsNumber() ||
      !(info[2].IsBigInt() || info[2].IsNumber())) {
    Napi::TypeError::New(
        env,
        "Expected number (pid), number (markerType), bigint|number (timestamp)")
        .ThrowAsJavaScriptException();
    return Napi::Number::New(env, 1);
  }

  int32_t pid = info[0].As<Napi::Number>().Int32Value();
  uint8_t marker_type =
      static_cast<uint8_t>(info[1].As<Napi::Number>().Uint32Value());
  uint64_t timestamp;
  if (info[2].IsBigInt()) {
    bool lossless = false;
    timestamp = info[2].As<Napi::BigInt>().Uint64Value(&lossless);
  } else {
    timestamp =
        static_cast<uint64_t>(info[2].As<Napi::Number>().DoubleValue());
  }

  uint8_t result =
      instrument_hooks_add_marker(hooks, pid, marker_type, timestamp);
  return Napi::Number::New(env, result);
}

Napi::Value __attribute__ ((noinline)) __codspeed_root_frame__(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() != 1) {
    Napi::TypeError::New(env, "Expected 1 argument: callback function")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsFunction()) {
    Napi::TypeError::New(env, "Expected function argument")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Function callback = info[0].As<Napi::Function>();
  Napi::Value result = callback.Call(env.Global(), {});
  
  return result;
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
  instrumentHooksObj.Set(Napi::String::New(env, "setEnvironment"),
                         Napi::Function::New(env, SetEnvironment));
  instrumentHooksObj.Set(Napi::String::New(env, "writeEnvironment"),
                         Napi::Function::New(env, WriteEnvironment));
  instrumentHooksObj.Set(Napi::String::New(env, "currentTimestamp"),
                         Napi::Function::New(env, CurrentTimestamp));
  instrumentHooksObj.Set(Napi::String::New(env, "addMarker"),
                         Napi::Function::New(env, AddMarker));
  instrumentHooksObj.Set(Napi::String::New(env, "__codspeed_root_frame__"),
                         Napi::Function::New(env, __codspeed_root_frame__));

  exports.Set(Napi::String::New(env, "InstrumentHooks"), instrumentHooksObj);

  return exports;
}

} // namespace hooks_wrapper
} // namespace instruments
} // namespace codspeed_native
