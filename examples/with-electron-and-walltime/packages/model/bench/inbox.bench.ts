import { bench, describe } from "vitest";
import { Inbox } from "../src/inbox.ts";
import { generateEmails } from "../src/seed.ts";

const EMAIL_COUNT = 10_000;

const emails = generateEmails({ count: EMAIL_COUNT });
const inbox = new Inbox(emails);

// 50 ids spread evenly through the inbox so findIndex has to scan varied
// distances. Mirrors a user selecting messages across the visible viewport
// and pressing the archive shortcut.
const archiveIds = Array.from({ length: 50 }, (_, i) => {
  // biome-ignore lint/style/noNonNullAssertion: index within bounds (50 * 200 == EMAIL_COUNT)
  return emails[i * (EMAIL_COUNT / 50)]!.id;
});

describe("Inbox.search — full-text over 10k inbox", () => {
  bench("'quarterly report' (common phrase)", () => {
    inbox.search("quarterly report");
  });

  bench("'kickoff' (single token, common)", () => {
    inbox.search("kickoff");
  });

  bench("'zzznomatch' (worst case: zero matches, full scan)", () => {
    inbox.search("zzznomatch");
  });
});

describe("Inbox.buildThreads — reconstruct conversation threads", () => {
  bench("10k flat emails -> threads", () => {
    inbox.buildThreads();
  });
});

describe("Inbox bulk mutations", () => {
  bench("archive 50 emails by id", () => {
    inbox.archive(archiveIds);
  });
});
