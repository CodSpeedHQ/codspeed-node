import { Bench, Fn, FnOptions } from "tinybench";

// tinybench stores the benchmark function and its options as private fields on
// `Task`. They were reachable through casts on older majors but became true
// `#private` fields in v6, so we capture them ourselves when `bench.add` runs
// and key them by task name, mirroring the URI map.
export interface CapturedTaskData {
  fn: Fn;
  fnOpts?: FnOptions;
}

const taskDataMap = new WeakMap<Bench, Map<string, CapturedTaskData>>();

export function getOrCreateTaskDataMap(
  bench: Bench,
): Map<string, CapturedTaskData> {
  let map = taskDataMap.get(bench);
  if (!map) {
    map = new Map<string, CapturedTaskData>();
    taskDataMap.set(bench, map);
  }
  return map;
}

export function getTaskData(
  bench: Bench,
  taskName: string,
): CapturedTaskData | undefined {
  return taskDataMap.get(bench)?.get(taskName);
}
