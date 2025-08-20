#include "hooks_wrapper.h"
#include "hooks/includes/core.h"
#include <unistd.h>

// Alias the C library type to avoid naming conflict
using InstrumentHooksHandle = ::InstrumentHooks;

namespace codspeed_native {

Napi::FunctionReference Hooks::constructor;

Napi::Object Hooks::Initialize(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "Hooks", {
    InstanceMethod("isInstrumented", &Hooks::IsInstrumented),
    InstanceMethod("startBenchmark", &Hooks::StartBenchmark),
    InstanceMethod("stopBenchmark", &Hooks::StopBenchmark),
    InstanceMethod("setExecutedBenchmark", &Hooks::SetExecutedBenchmark),
    InstanceMethod("setIntegration", &Hooks::SetIntegration),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("Hooks", func);
  return exports;
}

Hooks::Hooks(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Hooks>(info) {
  hooks_instance = instrument_hooks_init();
}

Hooks::~Hooks() {
  if (hooks_instance != nullptr) {
    instrument_hooks_deinit(static_cast<InstrumentHooksHandle*>(hooks_instance));
  }
}

Napi::Value Hooks::IsInstrumented(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  bool result = instrument_hooks_is_instrumented(static_cast<InstrumentHooksHandle*>(hooks_instance));
  return Napi::Boolean::New(env, result);
}

Napi::Value Hooks::StartBenchmark(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int8_t result = instrument_hooks_start_benchmark(static_cast<InstrumentHooksHandle*>(hooks_instance));
  return Napi::Number::New(env, result);
}

Napi::Value Hooks::StopBenchmark(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int8_t result = instrument_hooks_stop_benchmark(static_cast<InstrumentHooksHandle*>(hooks_instance));
  return Napi::Number::New(env, result);
}

Napi::Value Hooks::SetExecutedBenchmark(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected pid and uri arguments").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[0].IsNumber() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected pid (number) and uri (string) arguments").ThrowAsJavaScriptException();
    return env.Null();
  }

  int32_t pid = info[0].As<Napi::Number>().Int32Value();
  std::string uri = info[1].As<Napi::String>().Utf8Value();

  int8_t result = instrument_hooks_set_executed_benchmark(
    static_cast<InstrumentHooksHandle*>(hooks_instance), 
    pid, 
    uri.c_str()
  );
  
  return Napi::Number::New(env, result);
}

Napi::Value Hooks::SetIntegration(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected name and version arguments").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Expected name and version to be strings").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string name = info[0].As<Napi::String>().Utf8Value();
  std::string version = info[1].As<Napi::String>().Utf8Value();

  int8_t result = instrument_hooks_set_integration(
    static_cast<InstrumentHooksHandle*>(hooks_instance), 
    name.c_str(), 
    version.c_str()
  );
  
  return Napi::Number::New(env, result);
}

}  // namespace codspeed_native