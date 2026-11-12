import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const PRELOAD_FLAGS = ["--import", "--require", "-r", "--loader"];
const TSX_PACKAGE_PATH = /[\\/]node_modules[\\/]tsx[\\/]/;

const isBareTsxSpecifier = (specifier: string) =>
  specifier === "tsx" || specifier.startsWith("tsx/");

const isTsxSpecifier = (specifier: string) =>
  isBareTsxSpecifier(specifier) || TSX_PACKAGE_PATH.test(specifier);

/**
 * Returns the tsx module preloaded by these node arguments: the `tsx`
 * specifier of `node --import tsx`, or the loader path the `tsx` CLI passes to
 * the node process running the script.
 */
export const findTsxPreload = (execArgv: string[]): string | undefined => {
  for (const [i, arg] of execArgv.entries()) {
    const separator = arg.indexOf("=");
    const flag = separator === -1 ? arg : arg.slice(0, separator);
    const value = separator === -1 ? execArgv[i + 1] : arg.slice(separator + 1);
    if (
      PRELOAD_FLAGS.includes(flag) &&
      value !== undefined &&
      isTsxSpecifier(value)
    ) {
      return value;
    }
  }
  return undefined;
};

export const getTsxPackageDir = (tsxPreload: string): string => {
  if (isBareTsxSpecifier(tsxPreload)) {
    // Bare preload specifiers resolve from the working directory
    const tsxPackageJson = createRequire(
      path.join(process.cwd(), "index.js"),
    ).resolve("tsx/package.json");
    return path.dirname(tsxPackageJson);
  }
  const tsxPath = path.resolve(
    tsxPreload.startsWith("file:") ? fileURLToPath(tsxPreload) : tsxPreload,
  );
  const match = TSX_PACKAGE_PATH.exec(tsxPath)!;
  return tsxPath.slice(0, match.index + match[0].length - 1);
};
