import { Bench } from "tinybench";

// Store URI mapping externally since fnOpts is private
export const taskUriMap = new WeakMap<Bench, Map<string, string>>();

export function getTaskUri(
  bench: Bench,
  taskName: string,
  rootCallingFile: string
): string {
  const uriMap = taskUriMap.get(bench);
  return uriMap?.get(taskName) || `${rootCallingFile}::${taskName}`;
}

export function getOrCreateUriMap(bench: Bench): Map<string, string> {
  let uriMap = taskUriMap.get(bench);
  if (!uriMap) {
    uriMap = new Map<string, string>();
    taskUriMap.set(bench, uriMap);
  }
  return uriMap;
}
