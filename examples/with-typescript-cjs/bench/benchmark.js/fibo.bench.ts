import type { WithCodSpeedSuite } from "@codspeed/benchmark.js-plugin";
import {
  iterativeFibonacci,
  recursiveCachedFibonacci,
  recursiveFibonacci,
} from "../../src/fibonacci";

export function registerFiboBenchmarks(suite: WithCodSpeedSuite) {
  suite
    .add("test_recursive_fibo_10", () => {
      recursiveFibonacci(10);
    })
    .add("test_recursive_fibo_20", () => {
      recursiveFibonacci(20);
    });

  suite
    .add("test_recursive_cached_fibo_10", () => {
      recursiveCachedFibonacci(10);
    })
    .add("test_recursive_cached_fibo_20", () => {
      recursiveCachedFibonacci(20);
    })
    .add("test_recursive_cached_fibo_30", () => {
      recursiveCachedFibonacci(30);
    });

  suite
    .add("test_iterative_fibo_10", () => {
      iterativeFibonacci(10);
    })
    .add("test_iterative_fibo_100", () => {
      iterativeFibonacci(100);
    });
}
