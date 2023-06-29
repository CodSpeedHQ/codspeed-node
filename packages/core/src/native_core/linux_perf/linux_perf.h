#ifndef __LINUX_PERF_H
#define __LINUX_PERF_H

#include "v8-profiler.h"
#include <fstream>
#include <napi.h>
#include <node_object_wrap.h>

namespace codspeed_native {

class LinuxPerfHandler : public v8::CodeEventHandler {
public:
  explicit LinuxPerfHandler(v8::Isolate *isolate);
  ~LinuxPerfHandler() override;

  void Handle(v8::CodeEvent *code_event) override;

private:
  std::ofstream mapFile;
  std::string FormatName(v8::CodeEvent *code_event);
  v8::Isolate *isolate_;
};

class LinuxPerf : public Napi::ObjectWrap<LinuxPerf> {
public:
  static Napi::Object Initialize(Napi::Env env, Napi::Object exports);

  LinuxPerf(const Napi::CallbackInfo &info);
  ~LinuxPerf() = default;

  Napi::Value Start(const Napi::CallbackInfo &info);
  Napi::Value Stop(const Napi::CallbackInfo &info);

  LinuxPerfHandler *handler;
};

} // namespace codspeed_native

#endif // __LINUX_PERF_H