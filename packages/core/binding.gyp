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
      "sources": [
        "src/native_core/measurement/measurement.cc",
        "src/native_core/linux_perf/linux_perf.cc",
        "src/native_core/linux_perf/linux_perf_listener.cc",
        "src/native_core/native_core.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ]
    },
  ]
}
