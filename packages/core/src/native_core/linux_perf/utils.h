#ifndef LINUX_PERF_UTILS_H
#define LINUX_PERF_UTILS_H

#include "v8-profiler.h"

static inline std::string
v8LocalStringToString(v8::Local<v8::String> v8String) {
  // Utf8Value NUL-terminates, so the c-string constructor stops at the first
  // embedded NUL, as callers expect for symbol names. It yields nullptr when
  // the conversion throws.
  v8::String::Utf8Value value(v8::Isolate::GetCurrent(), v8String);
  return *value ? std::string(*value) : std::string();
}

#endif // LINUX_PERF_UTILS_H
