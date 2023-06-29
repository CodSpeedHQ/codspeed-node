#include <napi.h>

#include "linux_perf.h"
#include <node_api.h>

Napi::Object LinuxPerf::Initialize(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "LinuxPerf",
                                    {InstanceMethod("start", &LinuxPerf::Start),
                                     InstanceMethod("stop", &LinuxPerf::Stop)});

  exports.Set("LinuxPerf", func);
  return exports;
}

LinuxPerf::LinuxPerf(const Napi::CallbackInfo &info)
    : Napi::ObjectWrap<LinuxPerf>(info) {
  handler = nullptr;
}

Napi::Value LinuxPerf::Start(const Napi::CallbackInfo &info) {
  if (handler == nullptr) {
    v8::Isolate *isolate = v8::Isolate::GetCurrent();
    handler = new LinuxPerfHandler(isolate);
    handler->Enable();
    return Napi::Boolean::New(info.Env(), true);
  }
  return Napi::Boolean::New(info.Env(), false);
}

Napi::Value LinuxPerf::Stop(const Napi::CallbackInfo &info) {
  if (handler != nullptr) {
    handler->Disable();
    delete handler;
    handler = nullptr;
    return Napi::Boolean::New(info.Env(), true);
  }
  return Napi::Boolean::New(info.Env(), false);
}
