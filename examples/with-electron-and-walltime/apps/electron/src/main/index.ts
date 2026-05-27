import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Action, AppState, EmailId } from "@mail-client-demo/model";
import {
  generateEmails,
  Inbox,
  makeInitialState,
  openDatabase,
  reduce,
  syncStateToDisk,
} from "@mail-client-demo/model";
import { app, BrowserWindow, ipcMain } from "electron";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Big enough that the naive implementations FEEL slow:
//   buildThreads (O(n²))                            ~1.5–2 s
//   sync (full JSON snapshot of 50k emails)         ~150–300 ms PER ACTION
//   bulkArchive of 500 ids                          ~150–250 ms
// Every IPC mutation runs through store.dispatch -> reduce -> syncStateToDisk,
// so the sync cost is paid on every keystroke / button click and every UI
// interaction feels the lag. Optimization will collapse all of it.
const EMAIL_COUNT = 50_000;

let state: AppState | null = null;
let db: ReturnType<typeof openDatabase> | null = null;

interface Timed<T> {
  result: T;
  durationMs: number;
}

function timed<T>(fn: () => T): Timed<T> {
  const t0 = performance.now();
  const result = fn();
  return { result, durationMs: performance.now() - t0 };
}

function dispatch(action: Action): { durationMs: number; syncMs: number } {
  const t0 = performance.now();
  if (!state || !db) return { durationMs: 0, syncMs: 0 };
  state = reduce(state, action);
  const sync = syncStateToDisk(state, db);
  return {
    durationMs: performance.now() - t0,
    syncMs: sync.durationMs,
  };
}

/**
 * Sync the current state to disk. Called from every read-only IPC handler so
 * the audit-trail file stays current with each user interaction (and so the
 * naive full-snapshot cost is felt on every UI op, not just mutations).
 */
function syncCurrentState(): number {
  if (!state || !db) return 0;
  return syncStateToDisk(state, db).durationMs;
}

function getInbox(): Inbox {
  return new Inbox(state ? state.emails : []);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Inbox",
    backgroundColor: "#0f1419",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  const seedStart = performance.now();
  const emails = generateEmails({ count: EMAIL_COUNT });
  state = makeInitialState(emails);
  const dbPath = join(app.getPath("userData"), "state.json");
  db = openDatabase(dbPath);
  console.log(
    `[main] seeded ${EMAIL_COUNT} emails in ${(performance.now() - seedStart).toFixed(1)} ms`,
  );
  console.log(`[main] persistence path: ${dbPath}`);

  // Initial sync so disk reflects the seeded state.
  const initialSync = syncStateToDisk(state, db);
  console.log(`[main] initial sync: ${initialSync.durationMs.toFixed(1)} ms`);

  ipcMain.handle("inbox:list", () => {
    const t = timed(() => getInbox().sortByDate(getInbox().visible()).slice(0, 200));
    const syncMs = syncCurrentState();
    return { ...t, syncMs };
  });

  ipcMain.handle("inbox:search", (_evt, query: string) => {
    const t = timed(() => getInbox().sortByDate(getInbox().search(query)).slice(0, 50));
    const syncMs = syncCurrentState();
    return { ...t, syncMs };
  });

  ipcMain.handle("inbox:threads", () => {
    const t = timed(() => {
      const threads = getInbox().buildThreads();
      threads.sort((a, b) => b.lastReceivedAt - a.lastReceivedAt);
      return threads.slice(0, 50);
    });
    const syncMs = syncCurrentState();
    return { ...t, syncMs };
  });

  ipcMain.handle("inbox:archive", (_evt, ids: EmailId[]) => {
    const { durationMs, syncMs } = dispatch({ type: "ARCHIVE", ids, at: Date.now() });
    return { result: ids.length, durationMs, syncMs };
  });

  ipcMain.handle("inbox:stats", () => {
    if (!state) return { total: 0, visible: 0, pendingOps: 0 };
    const inbox = getInbox();
    return {
      total: state.emails.length,
      visible: inbox.visible().length,
      pendingOps: state.pendingOps.length,
    };
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
