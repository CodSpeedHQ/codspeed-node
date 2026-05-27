import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bench, describe } from "vitest";
import { openDatabase, syncStateToDisk } from "../src/persistence.ts";
import { generateEmails } from "../src/seed.ts";
import { type AppState, makeInitialState, reduce } from "../src/store.ts";

const EMAIL_COUNT = 10_000;
const emails = generateEmails({ count: EMAIL_COUNT });
const initial: AppState = makeInitialState(emails);

// 50 ids spread evenly through the inbox.
const archiveIds = Array.from({ length: 50 }, (_, i) => {
  // biome-ignore lint/style/noNonNullAssertion: index within bounds
  return emails[i * (EMAIL_COUNT / 50)]!.id;
});

describe("Store.reduce — pure mutation actions", () => {
  bench("ARCHIVE 50 ids over 10k state", () => {
    reduce(initial, { type: "ARCHIVE", ids: archiveIds, at: Date.now() });
  });

  bench("MARK_READ 50 ids over 10k state", () => {
    reduce(initial, { type: "MARK_READ", ids: archiveIds, at: Date.now() });
  });
});

describe("syncStateToDisk — full JSON snapshot to disk", () => {
  const tmp = mkdtempSync(join(tmpdir(), "model-bench-"));
  const dbPath = join(tmp, "state.json");
  const db = openDatabase(dbPath);

  // One ARCHIVE dispatched so the journal has a pending op.
  const archived = reduce(initial, { type: "ARCHIVE", ids: archiveIds, at: Date.now() });

  bench("sync 10k emails snapshot + 1 pending op", () => {
    syncStateToDisk(archived, db);
  });
});
