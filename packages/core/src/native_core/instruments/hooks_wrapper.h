#ifndef HOOKS_WRAPPER_H
#define HOOKS_WRAPPER_H

#include <napi.h>

namespace codspeed_native {

class Hooks : public Napi::ObjectWrap<Hooks> {
 public:
  static Napi::Object Initialize(Napi::Env env, Napi::Object exports);
  Hooks(const Napi::CallbackInfo& info);
  ~Hooks();

 private:
  static Napi::FunctionReference constructor;
  
  Napi::Value IsInstrumented(const Napi::CallbackInfo& info);
  Napi::Value StartBenchmark(const Napi::CallbackInfo& info);
  Napi::Value StopBenchmark(const Napi::CallbackInfo& info);
  Napi::Value SetExecutedBenchmark(const Napi::CallbackInfo& info);
  Napi::Value SetIntegration(const Napi::CallbackInfo& info);

  void* hooks_instance;
};

}  // namespace codspeed_native

#endif