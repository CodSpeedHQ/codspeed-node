/**
 * Node.js loader, loaded before tsx, that changes how tsx's esbuild instance
 * transforms files:
 * - turns off `keepNames`, whose `__name()` wrappers run inside the measured
 *   code and hide arrow function names from V8, and `minifyWhitespace`, which
 *   puts each module on a single line;
 * - starts esbuild's service processes without `--ping`, which makes them ping
 *   their host thread every second, in the middle of measurements.
 */
import {
  createRequire,
  register,
  type InitializeHook,
  type ResolveHookSync,
} from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  isMainThread,
  workerData,
  type WorkerOptions,
} from "node:worker_threads";

import { findTsxPreload, getTsxPackageDir } from "./tsx";

interface TransformOptions {
  keepNames?: boolean;
  minifyWhitespace?: boolean;
  sourcemap?: boolean | string;
  target?: string | string[];
}

interface Esbuild {
  transform(input: string, options?: TransformOptions): Promise<unknown>;
  transformSync(input: string, options?: TransformOptions): unknown;
}

interface LoaderData {
  tsxDirUrl: string;
  esbuildPath: string;
}

const LOADER_URL = pathToFileURL(__filename).href;
const TSX_TARGET = `node${process.versions.node}`;
const loaderRequire = createRequire(__filename);

let data: LoaderData;
let esbuild: Esbuild;

// The esbuild instance can be shared with user code, so match tsx's own options
const overrideTsxOptions = (options?: TransformOptions) => {
  const isTsxTransform =
    options?.keepNames === true &&
    options.minifyWhitespace === true &&
    options.sourcemap === true &&
    options.target === TSX_TARGET;
  return isTsxTransform
    ? { ...options, keepNames: false, minifyWhitespace: false }
    : options;
};

export const transform = (input: string, options?: TransformOptions) =>
  esbuild.transform(input, overrideTsxOptions(options));

export const transformSync = (input: string, options?: TransformOptions) =>
  esbuild.transformSync(input, overrideTsxOptions(options));

const dropEsbuildPing = () => {
  const childProcess: typeof import("node:child_process") =
    loaderRequire("node:child_process");
  const { spawn } = childProcess;
  childProcess.spawn = ((command: string, ...rest: unknown[]) => {
    const [args] = rest;
    const isEsbuildService =
      Array.isArray(args) &&
      args.some((arg) => String(arg).startsWith("--service="));
    if (isEsbuildService) {
      rest[0] = args.filter((arg) => arg !== "--ping");
    }
    return Reflect.apply(spawn, childProcess, [command, ...rest]);
  }) as typeof spawn;
};

// esbuild's sync API runs its service from a worker thread of its own
const preloadInEsbuildWorkers = () => {
  const workerThreads: typeof import("node:worker_threads") = loaderRequire(
    "node:worker_threads",
  );
  const { Worker } = workerThreads;
  workerThreads.Worker = class extends Worker {
    constructor(filename: string | URL, options?: WorkerOptions) {
      const isEsbuildWorker = options?.workerData?.esbuildVersion !== undefined;
      super(
        filename,
        isEsbuildWorker
          ? {
              ...options,
              execArgv: [
                ...(options?.execArgv ?? []),
                `--require=${__filename}`,
              ],
            }
          : options,
      );
    }
  };
};

const setup = (loaderData: LoaderData) => {
  data = loaderData;
  dropEsbuildPing();
  preloadInEsbuildWorkers();
  esbuild = loaderRequire(data.esbuildPath);
  // Covers tsx's CommonJS chunks, which `require("esbuild")`
  loaderRequire.cache[data.esbuildPath]!.exports = Object.defineProperty(
    { ...esbuild, transform, transformSync },
    "__esModule",
    { value: true },
  );
};

export const initialize: InitializeHook<LoaderData> = setup;

// Covers tsx's ES module chunks, which `import ... from "esbuild"`
export const resolve: ResolveHookSync = (specifier, context, nextResolve) => {
  const isEsbuildImportFromTsx =
    specifier === "esbuild" &&
    !context.conditions.includes("require") &&
    context.parentURL?.startsWith(data.tsxDirUrl) === true;
  if (!isEsbuildImportFromTsx) {
    return nextResolve(specifier, context);
  }
  const source = [
    `export * from ${JSON.stringify(pathToFileURL(data.esbuildPath).href)};`,
    `export { transform, transformSync } from ${JSON.stringify(LOADER_URL)};`,
  ].join("\n");
  return {
    url: `data:text/javascript,${encodeURIComponent(source)}`,
    shortCircuit: true,
  };
};

// tsx registers its hooks in-thread with `registerHooks` on recent Node
// versions and off-thread with `register` otherwise, where ours must be
// registered first to resolve the imports of tsx's hooks module
const registerResolveHook = (loaderData: LoaderData) => {
  const nodeModule: typeof import("node:module") = loaderRequire("node:module");
  if (typeof nodeModule.registerHooks !== "function") {
    register(LOADER_URL, { data: loaderData });
    return;
  }
  nodeModule.registerHooks({ resolve });
  const offThreadRegister = nodeModule.register;
  let isRegisteredOffThread = false;
  nodeModule.register = ((...args: unknown[]) => {
    if (!isRegisteredOffThread) {
      isRegisteredOffThread = true;
      offThreadRegister(LOADER_URL, { data: loaderData });
    }
    return Reflect.apply(offThreadRegister, nodeModule, args);
  }) as typeof offThreadRegister;
  nodeModule.syncBuiltinESMExports();
};

const tsxPreload = isMainThread ? findTsxPreload(process.execArgv) : undefined;
if (tsxPreload !== undefined) {
  try {
    const tsxDir = getTsxPackageDir(tsxPreload);
    const loaderData: LoaderData = {
      tsxDirUrl: pathToFileURL(tsxDir).href + "/",
      esbuildPath: createRequire(path.join(tsxDir, "package.json")).resolve(
        "esbuild",
      ),
    };
    // tsx caches transforms on disk, keyed on its own options
    process.env.TSX_DISABLE_CACHE = "1";
    setup(loaderData);
    registerResolveHook(loaderData);
  } catch (error) {
    console.warn(
      `[CodSpeed] could not adjust tsx's transforms, keeping its defaults: ${error}`,
    );
  }
} else if (workerData?.esbuildVersion !== undefined) {
  dropEsbuildPing();
}
