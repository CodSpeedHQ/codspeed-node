#include "linux_perf/linux_perf.h"
#include "instruments/hooks_wrapper.h"
#include <napi.h>

#include <cerrno>
#include <cstring>
#include <string>
#include <vector>

#if !defined(_WIN32)
#include <fcntl.h>
#include <unistd.h>
#endif

namespace codspeed_native {

namespace {

bool ContainsNulByte(const std::string &value) {
  return value.find('\0') != std::string::npos;
}

#if !defined(_WIN32)
// `execv` closes descriptors marked close-on-exec, and libuv marks the stdio
// descriptors that way. Clear the flag like Node's own `process.execve` does;
// otherwise the restarted process writes to /dev/null.
int PersistStandardStream(int fd) {
  const int flags = fcntl(fd, F_GETFD, 0);
  if (flags < 0) {
    return flags;
  }
  return fcntl(fd, F_SETFD, flags & ~FD_CLOEXEC);
}
#endif

// Replaces the process image via `execv`, keeping the PID, environment and open
// descriptors. Throws on failure; the current image stays usable.
Napi::Value Restart(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() != 2) {
    Napi::TypeError::New(env, "Expected 2 arguments: executable and args")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "Expected string (executable)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[1].IsArray()) {
    Napi::TypeError::New(env, "Expected array of strings (args)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const std::string executable = info[0].As<Napi::String>().Utf8Value();
  if (executable.empty()) {
    Napi::TypeError::New(env, "Expected non-empty string (executable)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (ContainsNulByte(executable)) {
    Napi::TypeError::New(env, "executable must not contain NUL bytes")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const Napi::Array args = info[1].As<Napi::Array>();
  const uint32_t argc = args.Length();
  if (argc == 0) {
    Napi::TypeError::New(env, "Expected at least argv[0] in args: pass the "
                              "complete argv, including the program name")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Fill the strings before taking any pointer out of them: `execv` needs
  // stable storage, so the vector must not reallocate afterwards.
  std::vector<std::string> arg_strings;
  arg_strings.reserve(argc);
  for (uint32_t i = 0; i < argc; i++) {
    const Napi::Value arg = args.Get(i);
    if (!arg.IsString()) {
      Napi::TypeError::New(env, "Expected string (args[" + std::to_string(i) +
                                    "])")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }
    arg_strings.push_back(arg.As<Napi::String>().Utf8Value());
    if (ContainsNulByte(arg_strings.back())) {
      Napi::TypeError::New(env, "args[" + std::to_string(i) +
                                    "] must not contain NUL bytes")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }
  }

#if defined(_WIN32)
  Napi::Error::New(env, "restart() is not supported on Windows: pass the "
                        "required Node.js flags from the launcher")
      .ThrowAsJavaScriptException();
  return env.Undefined();
#else
  std::vector<char *> argv;
  argv.reserve(arg_strings.size() + 1);
  for (std::string &arg : arg_strings) {
    argv.push_back(const_cast<char *>(arg.c_str()));
  }
  argv.push_back(nullptr);

  if (PersistStandardStream(0) < 0 || PersistStandardStream(1) < 0 ||
      PersistStandardStream(2) < 0) {
    const int fcntl_errno = errno;
    Napi::Error::New(env, "Failed to keep stdio open across restart: " +
                              std::string(std::strerror(fcntl_errno)))
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  execv(executable.c_str(), argv.data());

  // Reaching this point means the exec failed and the current process is still
  // running. Capture errno before any further N-API call can clobber it.
  const int exec_errno = errno;
  Napi::Error::New(env, "Failed to restart with execv(\"" + executable +
                            "\"): " + std::strerror(exec_errno))
      .ThrowAsJavaScriptException();
  return env.Undefined();
#endif
}

} // namespace

Napi::Object Initialize(Napi::Env env, Napi::Object exports) {
  codspeed_native::LinuxPerf::Initialize(env, exports);
  codspeed_native::instruments::hooks_wrapper::Initialize(env, exports);
  exports.Set(Napi::String::New(env, "restart"),
              Napi::Function::New(env, Restart));

  return exports;
}

NODE_API_MODULE(native_core, Initialize)

} // namespace codspeed_native
