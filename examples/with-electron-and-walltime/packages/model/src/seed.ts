import type { Address, Email, EmailId, LabelId, ThreadId } from "./types.ts";

const CONTACTS: Address[] = [
  { name: "Rahul Vora", email: "rahul@acme.io" },
  { name: "Mei Tanaka", email: "mei@northwind.dev" },
  { name: "Sofia García", email: "sofia.garcia@fastmail.com" },
  { name: "Liam O'Connor", email: "liam@octopus.energy" },
  { name: "Ava Nguyen", email: "ava@stripe.com" },
  { name: "Noah Patel", email: "noah@linear.app" },
  { name: "Zara Khan", email: "zara@vercel.com" },
  { name: "Ethan Brooks", email: "ethan@notion.so" },
  { name: "Yuki Sato", email: "yuki@figma.com" },
  { name: "Diego Ramírez", email: "diego@cloudflare.com" },
  { name: "Aanya Iyer", email: "aanya@anthropic.com" },
  { name: "Mateo Silva", email: "mateo@github.com" },
  { name: "Hana Park", email: "hana@spotify.com" },
  { name: "Theo Laurent", email: "theo@datadoghq.com" },
  { name: "Priya Bhatt", email: "priya@retool.com" },
  { name: "Jonas Berg", email: "jonas@sentry.io" },
  { name: "Maya Fischer", email: "maya@plaid.com" },
  { name: "Omar Saleh", email: "omar@brex.com" },
  { name: "Lin Wei", email: "lin@bytedance.com" },
  { name: "Erika Holm", email: "erika@klarna.com" },
  { name: "Jamal Carter", email: "jamal@warp.dev" },
  { name: "Ines Costa", email: "ines@n26.com" },
  { name: "Hugo Martin", email: "hugo@scaleway.com" },
  { name: "Sara Akhtar", email: "sara@deepl.com" },
  { name: "Daniel Hoffman", email: "daniel@1password.com" },
  { name: "Lucia Rossi", email: "lucia@checkout.com" },
  { name: "Kenji Mori", email: "kenji@line.me" },
  { name: "Naomi Schwartz", email: "naomi@coinbase.com" },
  { name: "Ravi Subramanian", email: "ravi@razorpay.com" },
  { name: "Camille Dubois", email: "camille@blablacar.com" },
];

const SUBJECT_FRAGMENTS = [
  "Re: ",
  "Fwd: ",
  "[Action Required] ",
  "Update: ",
  "Quick question on ",
  "Heads up — ",
  "Follow-up: ",
  "Reminder: ",
  "",
  "",
];

const SUBJECT_TOPICS = [
  "quarterly report",
  "kickoff meeting notes",
  "design review feedback",
  "production incident postmortem",
  "compensation review cycle",
  "onboarding checklist",
  "API rate-limit changes",
  "billing portal launch",
  "performance regression in checkout",
  "candidate panel for the staff role",
  "hiring loop debrief",
  "new analytics dashboard",
  "infra migration cutover",
  "vendor contract renewal",
  "RFC: caching strategy",
  "OKR draft for next quarter",
  "1:1 reschedule",
  "customer escalation: Acme Corp",
  "EU compliance update",
  "snippets for the all-hands",
];

const BODY_SENTENCES = [
  "Pinging again on this — let me know if it slipped through.",
  "Attaching the deck for tomorrow's review, would love your eyes on slide 4.",
  "We saw a spike in p95 between 14:02 and 14:18 UTC; root cause was a cold cache rollover.",
  "Pushed a draft PR; gating on the migration before we ship to canary.",
  "Two open questions remain: pricing tier and SLA wording.",
  "Looping in the platform team for visibility.",
  "Could you confirm the timeline before I send the final?",
  "Quick note: the metric definition changed last week, so prior numbers don't compare cleanly.",
  "Let me know if Tuesday at 10:00 works on your end.",
  "Closing the loop here — the issue was a stale config, redeploy fixed it.",
  "Sharing the doc with edit access so you can leave inline comments.",
  "We're holding the launch until legal signs off on the DPA.",
  "Following up after our chat last week.",
  "The dashboard now renders under 80ms p50, which clears the bar we set in Q2.",
  "Heads up: I'll be OOO Thu–Fri, please ping Mei for anything urgent.",
];

const LABEL_POOL: LabelId[] = [
  "inbox",
  "work",
  "personal",
  "newsletters",
  "updates",
  "promotions",
  "important",
  "follow-up",
];

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  const idx = Math.floor(rng() * arr.length);
  // biome-ignore lint/style/noNonNullAssertion: idx is bounded by arr.length
  return arr[idx]!;
}

function pickN<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < n && used.size < arr.length) {
    const idx = Math.floor(rng() * arr.length);
    if (used.has(idx)) continue;
    used.add(idx);
    // biome-ignore lint/style/noNonNullAssertion: idx within bounds
    out.push(arr[idx]!);
  }
  return out;
}

export interface SeedOptions {
  count: number;
  seed?: number;
  /** Fraction of emails that start a new thread (vs. reply to existing). Default 0.25. */
  newThreadRate?: number;
}

/**
 * Build a deterministic inbox with realistic-ish threading, labels, and read state.
 *
 * Emits emails ordered by `receivedAt` descending (most recent first) — matches
 * how a mail client actually presents its inbox.
 */
export function generateEmails(opts: SeedOptions): Email[] {
  const { count, seed = 42, newThreadRate = 0.25 } = opts;
  const rng = mulberry32(seed);

  const emails: Email[] = [];
  const openThreads: { id: ThreadId; lastEmailId: EmailId; refs: EmailId[]; subject: string }[] =
    [];

  // ~2 years of history, evenly stepping back from "now"
  const now = Date.UTC(2026, 4, 20, 12, 0, 0);
  const stepMs = Math.floor((1000 * 60 * 60 * 24 * 730) / count);

  for (let i = 0; i < count; i++) {
    const id: EmailId = `e_${i.toString(36)}`;
    const receivedAt = now - i * stepMs - Math.floor(rng() * stepMs);

    const startNewThread = openThreads.length === 0 || rng() < newThreadRate;

    let threadId: ThreadId;
    let inReplyTo: EmailId | null;
    let references: EmailId[];
    let subject: string;

    if (startNewThread) {
      threadId = `t_${openThreads.length.toString(36)}`;
      inReplyTo = null;
      references = [];
      subject = `${pick(rng, SUBJECT_FRAGMENTS)}${pick(rng, SUBJECT_TOPICS)}`;
      openThreads.push({ id: threadId, lastEmailId: id, refs: [id], subject });
    } else {
      // biome-ignore lint/style/noNonNullAssertion: openThreads non-empty guarded above
      const t = openThreads[Math.floor(rng() * openThreads.length)]!;
      threadId = t.id;
      inReplyTo = t.lastEmailId;
      references = [...t.refs];
      subject = t.subject.startsWith("Re: ") ? t.subject : `Re: ${t.subject}`;
      t.lastEmailId = id;
      t.refs.push(id);
      // After ~6 replies, retire the thread so it doesn't grow forever
      if (t.refs.length > 6) {
        const idx = openThreads.indexOf(t);
        openThreads.splice(idx, 1);
      }
    }

    const from = pick(rng, CONTACTS);
    const to = pickN(rng, CONTACTS, 1 + Math.floor(rng() * 2));
    const cc = rng() < 0.25 ? pickN(rng, CONTACTS, 1 + Math.floor(rng() * 2)) : [];
    const body = pickN(rng, BODY_SENTENCES, 2 + Math.floor(rng() * 3)).join(" ");
    const snippet = body.slice(0, 120);
    const labels = pickN(rng, LABEL_POOL, 1 + Math.floor(rng() * 2));

    emails.push({
      id,
      threadId,
      inReplyTo,
      references,
      from,
      to,
      cc,
      subject,
      body,
      snippet,
      receivedAt,
      read: rng() > 0.3,
      starred: rng() < 0.1,
      archived: rng() < 0.05,
      trashed: rng() < 0.02,
      labels,
      sizeBytes: 1024 + Math.floor(rng() * 8192),
    });
  }

  return emails;
}
