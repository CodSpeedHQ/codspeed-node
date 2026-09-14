import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "fs";
import { SourceMap, type SourceMapPayload } from "module";
import { dirname, resolve } from "path";

/** Trailing `<url>:<line>:<column>` of a perf map symbol. */
const SYMBOL_LOCATION = /(\S+):(\d+):(\d+)$/;
const ORIGIN = /^https?:\/\/[^/]+/;
const FS_PREFIX = "/@fs";

interface ServedModule {
  file: string | null;
  transformResult: { map?: SourceMapPayload | null } | null;
}

interface ModuleGraph {
  urlToModuleMap: Map<string, ServedModule>;
}

/** The dev server the page loaded its modules from, narrowed to what they are resolved with. */
export interface ServingViteServer {
  config: { root: string };
  environments?: { client?: { moduleGraph?: ModuleGraph } };
  moduleGraph?: ModuleGraph;
}

interface Position {
  file: string;
  line: number;
  column: number;
}

/**
 * V8 names each JIT frame after the URL the script was served from, at the
 * position it has in the module the server transformed. Resolving both back to
 * the file on disk and the position it has there is what lets a frame be traced
 * to the source a user can go and edit.
 *
 * The browser keeps the map open at an offset of its own for as long as it
 * lives, so rewriting it in place truncates whatever it appends next: the
 * normalized content is moved over it instead, once nothing is left to measure.
 */
export function normalizePerfMap(
  pid: number,
  server: ServingViteServer | null,
): void {
  const perfMapPath = `/tmp/perf-${pid}.map`;
  if (!existsSync(perfMapPath)) {
    return;
  }

  const sourceMaps = new Map<string, SourceMap | null>();
  const normalized = readFileSync(perfMapPath, "utf8")
    .split("\n")
    .map((line) => normalizeLine(line, server, sourceMaps))
    .join("\n");

  const replacementPath = `${perfMapPath}.codspeed`;
  writeFileSync(replacementPath, normalized);
  renameSync(replacementPath, perfMapPath);
}

function normalizeLine(
  line: string,
  server: ServingViteServer | null,
  sourceMaps: Map<string, SourceMap | null>,
): string {
  const match = SYMBOL_LOCATION.exec(line);
  if (match === null) {
    return line;
  }

  const [, url, rawLine, rawColumn] = match;
  const position = resolvePosition(
    url,
    Number(rawLine),
    Number(rawColumn),
    server,
    sourceMaps,
  );
  return `${line.slice(0, match.index)}${position.file}:${position.line}:${position.column}`;
}

function resolvePosition(
  url: string,
  line: number,
  column: number,
  server: ServingViteServer | null,
  sourceMaps: Map<string, SourceMap | null>,
): Position {
  const servedPath = url.replace(ORIGIN, "");
  const file = resolveFile(servedPath, url, server);
  if (file === null) {
    return { file: stripQuery(servedPath), line, column };
  }

  const sourceMap = resolveSourceMap(url, file, server, sourceMaps);
  const entry = sourceMap?.findEntry(line - 1, column - 1);
  if (entry === undefined || !("originalSource" in entry)) {
    return { file, line, column };
  }
  return {
    file: resolve(dirname(file), entry.originalSource),
    line: entry.originalLine + 1,
    column: entry.originalColumn + 1,
  };
}

function resolveFile(
  servedPath: string,
  url: string,
  server: ServingViteServer | null,
): string | null {
  const moduleFile = findModule(url, servedPath, server)?.file;
  if (moduleFile != null) {
    return moduleFile;
  }

  const path = stripQuery(servedPath);
  if (path.startsWith(`${FS_PREFIX}/`)) {
    return path.slice(FS_PREFIX.length);
  }
  if (server === null || !path.startsWith("/")) {
    return null;
  }
  const rootFile = resolve(server.config.root, path.slice(1));
  return statSync(rootFile, { throwIfNoEntry: false })?.isFile() === true
    ? rootFile
    : null;
}

function findModule(
  url: string,
  servedPath: string,
  server: ServingViteServer | null,
): ServedModule | undefined {
  const moduleGraph =
    server?.environments?.client?.moduleGraph ?? server?.moduleGraph;
  if (moduleGraph === undefined) {
    return undefined;
  }
  for (const key of [url, servedPath, stripQuery(servedPath)]) {
    const found = moduleGraph.urlToModuleMap.get(key);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * The map of a module, from the transform that produced it or, for the files
 * the server hands over untransformed, from the map written next to them.
 */
function resolveSourceMap(
  url: string,
  file: string,
  server: ServingViteServer | null,
  sourceMaps: Map<string, SourceMap | null>,
): SourceMap | null {
  const cached = sourceMaps.get(url);
  if (cached !== undefined) {
    return cached;
  }

  const payload =
    findModule(url, url.replace(ORIGIN, ""), server)?.transformResult?.map ??
    readSidecarMap(file);
  const sourceMap = payload == null ? null : buildSourceMap(payload);
  sourceMaps.set(url, sourceMap);
  return sourceMap;
}

function buildSourceMap(payload: SourceMapPayload): SourceMap | null {
  try {
    return new SourceMap(payload);
  } catch {
    return null;
  }
}

function readSidecarMap(file: string): SourceMapPayload | null {
  const sidecarPath = `${file}.map`;
  if (!existsSync(sidecarPath)) {
    return null;
  }
  return JSON.parse(readFileSync(sidecarPath, "utf8")) as SourceMapPayload;
}

function stripQuery(path: string): string {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}
