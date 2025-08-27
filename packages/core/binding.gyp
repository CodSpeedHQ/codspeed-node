{
  "targets": [
    {
      "target_name": "native_core",
      "cflags!": [
        "-fno-exceptions"
      ],
      "cflags_cc!": [
        "-fno-exceptions"
      ],
      "cflags": [
        "-Wno-maybe-uninitialized",
        "-Wno-unused-variable",
        "-Wno-unused-parameter",
        "-Wno-unused-but-set-variable",
        "-Wno-type-limits"
      ],
      "cflags_cc": [
        "-Wno-maybe-uninitialized",
        "-Wno-unused-variable",
        "-Wno-unused-parameter",
        "-Wno-unused-but-set-variable",
        "-Wno-type-limits"
      ],
      "sources": [
        "src/native_core/linux_perf/linux_perf.cc",
        "src/native_core/linux_perf/linux_perf_listener.cc",
        "src/native_core/instruments/hooks_wrapper.cc",
        "src/native_core/instruments/hooks/dist/core.c",
        "src/native_core/native_core.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src/native_core/instruments/hooks/includes"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ]
    },
  ]
}
