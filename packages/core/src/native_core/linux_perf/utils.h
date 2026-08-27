#ifndef LINUX_PERF_UTILS_H
#define LINUX_PERF_UTILS_H

#include "v8-profiler.h"
#include <js_native_api.h>
#include <string>

// The string conversions are the only part of the V8 C++ API used here that is
// not ABI-stable: Utf8Value's constructor gained a defaulted argument in Node
// 24, and WriteUtf8 gave way to WriteUtf8V2 in Node 26, so none of them
// resolves on every major. Node-API is versioned and does not move, and
// napi_value is layout-compatible with v8::Local<v8::Value> by construction.
static inline std::string
v8LocalStringToString(napi_env env, v8::Local<v8::String> v8String) {
  if (v8String.IsEmpty()) {
    return std::string();
  }

  napi_value value = reinterpret_cast<napi_value>(*v8String);
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) {
    return std::string();
  }

  std::string result(length + 1, '\0');
  if (napi_get_value_string_utf8(env, value, result.data(), result.size(),
                                 &length) != napi_ok) {
    return std::string();
  }

  result.resize(length);
  return result;
}

#endif // LINUX_PERF_UTILS_H
