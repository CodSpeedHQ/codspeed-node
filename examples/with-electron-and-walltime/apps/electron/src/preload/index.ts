import type { Email, EmailId, Thread } from "@mail-client-demo/model";
import { contextBridge, ipcRenderer } from "electron";

export interface TimedWithSync<T> {
  result: T;
  durationMs: number;
  syncMs: number;
}

export interface ArchiveResult {
  result: number;
  durationMs: number;
  syncMs: number;
}

export interface InboxStats {
  total: number;
  visible: number;
  pendingOps: number;
}

const api = {
  list: (): Promise<TimedWithSync<Email[]>> => ipcRenderer.invoke("inbox:list"),
  search: (query: string): Promise<TimedWithSync<Email[]>> =>
    ipcRenderer.invoke("inbox:search", query),
  threads: (): Promise<TimedWithSync<Thread[]>> => ipcRenderer.invoke("inbox:threads"),
  archive: (ids: EmailId[]): Promise<ArchiveResult> => ipcRenderer.invoke("inbox:archive", ids),
  stats: (): Promise<InboxStats> => ipcRenderer.invoke("inbox:stats"),
};

contextBridge.exposeInMainWorld("inbox", api);

export type InboxBridge = typeof api;
