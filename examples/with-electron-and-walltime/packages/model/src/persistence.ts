import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { AppState, PendingOp } from "./store.ts";
import type { Email } from "./types.ts";

/**
 * Local-file persistence for the AppState.
 *
 * Each sync re-serialises the full state to JSON and writes the whole file.
 * An incremental journal that appended only the new pending ops would
 * obviously scale better; the snapshot-on-every-flush approach is the
 * intentional starting point so the cost is visible on the bench dashboard
 * before we optimise it.
 */

export interface Db {
  path: string;
}

export function openDatabase(path: string): Db {
  return { path };
}

export function closeDatabase(_db: Db): void {
  /* no-op for the file-backed implementation */
}

export interface PersistedSnapshot {
  emails: Email[];
  pendingOps: PendingOp[];
  syncedAt: number;
  formatVersion: 1;
}

export interface SyncResult {
  durationMs: number;
  bytesWritten: number;
}

export function syncStateToDisk(state: AppState, db: Db): SyncResult {
  const start = performance.now();

  const snapshot = serializeStateForSync(state);
  const payload = stringifySnapshot(snapshot);
  writeSnapshotFile(db.path, payload);

  return {
    durationMs: performance.now() - start,
    bytesWritten: payload.length,
  };
}

function serializeStateForSync(state: AppState): PersistedSnapshot {
  return {
    emails: state.emails,
    pendingOps: state.pendingOps,
    syncedAt: Date.now(),
    formatVersion: 1,
  };
}

function stringifySnapshot(snapshot: PersistedSnapshot): string {
  return JSON.stringify(snapshot);
}

function writeSnapshotFile(path: string, payload: string): void {
  writeFileSync(path, payload);
}

export function loadStateFromDisk(db: Db): PersistedSnapshot | null {
  if (!existsSync(db.path)) return null;
  const raw = readFileSync(db.path, "utf8");
  return JSON.parse(raw) as PersistedSnapshot;
}
