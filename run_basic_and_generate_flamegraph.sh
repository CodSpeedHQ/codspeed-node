#!/usr/bin/env bash

set -xeuo pipefail

perf record -g -k 1 --call-graph dwarf --freq 999 -- node --perf-prof --perf-prof-unwinding-info --interpreted-frames-native-stack --allow-natives-syntax basic.js
perf inject -j -i perf.data -o perf.jit.data
perf script -i perf.jit.data --no-inline | inferno-collapse-perf | inferno-flamegraph > flamegraph.svg
