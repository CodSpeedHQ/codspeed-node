#include "linux_perf.h"
#include "utils.h"
#include <sstream>
#include <uv.h>

LinuxPerfHandler::LinuxPerfHandler(v8::Isolate *isolate)
    : v8::CodeEventHandler(isolate) {
  isolate_ = isolate;
  int pid = static_cast<int>(uv_os_getpid());
  mapFile.open("/tmp/perf-" + std::to_string(pid) + ".map");
}

LinuxPerfHandler::~LinuxPerfHandler() { mapFile.close(); }

std::string LinuxPerfHandler::FormatName(v8::CodeEvent *code_event) {
  std::string name = std::string(code_event->GetComment());
  if (name.empty()) {
    name = v8LocalStringToString(code_event->GetFunctionName());
  }
  return name;
}

void LinuxPerfHandler::Handle(v8::CodeEvent *code_event) {
  mapFile << std::hex << code_event->GetCodeStartAddress() << " "
          << code_event->GetCodeSize() << " ";
  mapFile << v8::CodeEvent::GetCodeEventTypeName(code_event->GetCodeType())
          << ":" << FormatName(code_event) << " "
          << v8LocalStringToString(code_event->GetScriptName()) << std::dec
          << ":" << code_event->GetScriptLine() << ":"
          << code_event->GetScriptColumn() << std::endl;
}
