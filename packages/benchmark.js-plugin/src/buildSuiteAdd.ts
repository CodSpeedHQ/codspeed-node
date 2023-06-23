import { Options, Suite } from "benchmark";
import { isFunction, isPlainObject } from "lodash";
import getCallingFile from "./getCallingFile";

function isOptions(options: unknown): options is Options {
  return isPlainObject(options);
}

export default function buildSuiteAdd(suite: Suite) {
  const rawAdd = suite.add;
  const suiteName = suite.name;

  function registerBenchmarkName(name: string) {
    const callingFile = getCallingFile(2); // [here, suite.add, actual caller]
    let uri = callingFile;
    if (suiteName !== undefined) {
      uri += `::${suiteName}`;
    }
    uri += `::${name}`;

    return uri;
  }

  function add(options: Options): Suite;
  // eslint-disable-next-line @typescript-eslint/ban-types
  function add(fn: Function, options?: Options): Suite;
  function add(name: string, options?: Options): Suite;
  // eslint-disable-next-line @typescript-eslint/ban-types
  function add(name: string, fn: Function, options?: Options): Suite;
  function add(name: unknown, fn?: unknown, opts?: unknown) {
    // 1 argument: (options: Options)
    if (isOptions(name)) {
      if (name.name !== undefined) {
        const rawFn = name.fn;
        if (typeof rawFn === "function") {
          const uri = registerBenchmarkName(name.name);
          const options = Object.assign({}, name, { uri });
          return rawAdd.bind(suite)(options);
        }
      }
      return rawAdd.bind(suite)(name);
    }

    // 2 arguments: (fn: Function, options?: Options)
    if (isFunction(name) && (isOptions(fn) || fn === undefined)) {
      if (fn !== undefined) {
        if (fn.name !== undefined) {
          const uri = registerBenchmarkName(fn.name);
          const options = Object.assign({}, fn, { uri });
          return rawAdd.bind(suite)(name, options);
        }
      }
      return rawAdd.bind(suite)(name, fn);
    }

    // 2 arguments: (name: string, options?: Options)
    if (typeof name === "string" && (isOptions(fn) || fn === undefined)) {
      if (fn !== undefined && typeof fn.fn === "function") {
        const uri = registerBenchmarkName(name);
        const options = Object.assign({}, fn, { uri });
        return rawAdd.bind(suite)(name, options);
      }
      return rawAdd.bind(suite)(name, fn);
    }

    // 3 arguments: (name: string, fn: Function, options?: Options)
    if (
      typeof name === "string" &&
      isFunction(fn) &&
      (isOptions(opts) || opts === undefined)
    ) {
      const uri = registerBenchmarkName(name);
      const options = Object.assign({}, opts ?? {}, { uri });
      return rawAdd.bind(suite)(name, fn, options);
    }
  }

  return add;
}
