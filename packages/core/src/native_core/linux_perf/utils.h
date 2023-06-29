#ifndef LINUX_PERF_UTILS_H
#define LINUX_PERF_UTILS_H

#include "v8-profiler.h"

static inline std::string
v8LocalStringToString(v8::Local<v8::String> v8String) {
  std::string buffer(v8String->Utf8Length(v8::Isolate::GetCurrent()) + 1, 0);
  v8String->WriteUtf8(v8::Isolate::GetCurrent(), &buffer[0],
                      v8String->Utf8Length(v8::Isolate::GetCurrent()) + 1);
  // Sanitize name, removing unwanted \0 resulted from WriteUtf8
  return std::string(buffer.c_str());
}

#endif // LINUX_PERF_UTILS_H