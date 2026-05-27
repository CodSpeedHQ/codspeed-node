import type { Address, Email, EmailId, LabelId, Thread, ThreadId } from "./types.ts";

/**
 * Mail-client backend-for-frontend model.
 *
 * Public methods compose small named helpers and pass *named* callbacks to
 * built-in array methods (`.filter`, `.find`, `.sort`, `.reduce`). Those
 * callbacks survive V8's inliner because the iteration runs in C++ and calls
 * back into JS — that keeps the CodSpeed flamegraph attributing time to the
 * specific work (haystack build, thread-member scan, ...) rather than
 * collapsing everything onto the public method.
 *
 * Implementations are deliberately the naive path; an optimization PR will
 * replace them with linear-time variants while preserving the same call shape.
 */
export class Inbox {
  emails: Email[];

  constructor(emails: Email[]) {
    this.emails = emails;
  }

  visible(): Email[] {
    return this.emails.filter(isVisibleEmail);
  }

  byLabel(label: LabelId): Email[] {
    return filterByLabel(this.emails, label);
  }

  /**
   * Full-text search across subject, body, and from-name.
   * Naive: linear scan; the haystack is rebuilt and case-folded per email.
   */
  search(query: string): Email[] {
    const needle = normalizeQuery(query);
    return this.emails.filter(function emailMatchesNeedle(email) {
      return emailContainsNeedle(email, needle);
    });
  }

  /**
   * Reconstruct conversation threads from the flat list.
   * Naive: for each unique thread we discover, re-scan the whole email list
   * to gather members — O(n × t) where t is the number of threads.
   */
  buildThreads(): Thread[] {
    const threadIds = collectUniqueThreadIds(this.emails);
    const threads: Thread[] = [];
    for (const threadId of threadIds) {
      const members = collectThreadMembers(this.emails, threadId);
      sortThreadByDate(members);
      threads.push(buildThreadSummary(threadId, members));
    }
    return threads;
  }

  sortByDate(emails: Email[], dir: "asc" | "desc" = "desc"): Email[] {
    return sortEmailsByDate(emails, dir);
  }

  paginate(emails: Email[], offset: number, limit: number): Email[] {
    return emails.slice(offset, offset + limit);
  }

  /**
   * Bulk-apply archive to a set of ids.
   * Naive: linear .find per id — O(n × k).
   */
  archive(ids: EmailId[]): void {
    for (const id of ids) {
      const target = findEmailById(this.emails, id);
      if (target) markArchived(target);
    }
  }

  markRead(ids: EmailId[]): void {
    for (const id of ids) {
      const target = findEmailById(this.emails, id);
      if (target) markEmailRead(target);
    }
  }

  trash(ids: EmailId[]): void {
    for (const id of ids) {
      const target = findEmailById(this.emails, id);
      if (target) markTrashed(target);
    }
  }
}

// ----------------------------------------------------------------------------
// Visibility / label predicates
// ----------------------------------------------------------------------------

function isVisibleEmail(email: Email): boolean {
  return !email.archived && !email.trashed;
}

export function filterByLabel(emails: Email[], label: LabelId): Email[] {
  return emails.filter(function emailCarriesLabel(email) {
    return email.labels.includes(label);
  });
}

// ----------------------------------------------------------------------------
// Search
// ----------------------------------------------------------------------------

export function normalizeQuery(query: string): string {
  return query.toLowerCase();
}

export function emailContainsNeedle(email: Email, needle: string): boolean {
  const haystack = buildSearchHaystack(email);
  return haystack.includes(needle);
}

export function buildSearchHaystack(email: Email): string {
  return `${email.subject} ${email.body} ${email.from.name}`.toLowerCase();
}

// ----------------------------------------------------------------------------
// Threading — three phases, each a discrete function with substantial work
// ----------------------------------------------------------------------------

export function collectUniqueThreadIds(emails: Email[]): ThreadId[] {
  const seen = new Set<ThreadId>();
  const ordered: ThreadId[] = [];
  for (const email of emails) {
    if (seen.has(email.threadId)) continue;
    seen.add(email.threadId);
    ordered.push(email.threadId);
  }
  return ordered;
}

export function collectThreadMembers(emails: Email[], threadId: ThreadId): Email[] {
  return emails.filter(function emailIsInThread(email) {
    return email.threadId === threadId;
  });
}

export function sortThreadByDate(members: Email[]): void {
  members.sort(compareByReceivedAtAsc);
}

function compareByReceivedAtAsc(a: Email, b: Email): number {
  return a.receivedAt - b.receivedAt;
}

function compareByReceivedAtDesc(a: Email, b: Email): number {
  return b.receivedAt - a.receivedAt;
}

export function buildThreadSummary(threadId: ThreadId, members: Email[]): Thread {
  return {
    id: threadId,
    emails: members,
    subject: extractCleanSubject(members),
    participants: extractParticipants(members),
    lastReceivedAt: extractLatestTimestamp(members),
    unreadCount: countUnread(members),
  };
}

function extractCleanSubject(members: Email[]): string {
  // biome-ignore lint/style/noNonNullAssertion: members non-empty by construction
  return stripReplyFwdPrefix(members[0]!.subject);
}

function stripReplyFwdPrefix(subject: string): string {
  return subject.replace(/^(Re: |Fwd: )+/, "");
}

function extractParticipants(members: Email[]): Address[] {
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const email of members) {
    if (seen.has(email.from.email)) continue;
    seen.add(email.from.email);
    out.push(email.from);
  }
  return out;
}

function extractLatestTimestamp(members: Email[]): number {
  return members.reduce(reduceMaxReceivedAt, 0);
}

function reduceMaxReceivedAt(acc: number, email: Email): number {
  return email.receivedAt > acc ? email.receivedAt : acc;
}

function countUnread(members: Email[]): number {
  return members.filter(isUnreadEmail).length;
}

function isUnreadEmail(email: Email): boolean {
  return !email.read;
}

// ----------------------------------------------------------------------------
// Sorting / pagination
// ----------------------------------------------------------------------------

export function sortEmailsByDate(emails: Email[], dir: "asc" | "desc"): Email[] {
  const copy = [...emails];
  copy.sort(dir === "asc" ? compareByReceivedAtAsc : compareByReceivedAtDesc);
  return copy;
}

// ----------------------------------------------------------------------------
// Bulk mutations
// ----------------------------------------------------------------------------

export function findEmailById(emails: Email[], id: EmailId): Email | undefined {
  return emails.find(function emailHasId(email) {
    return email.id === id;
  });
}

function markArchived(email: Email): void {
  email.archived = true;
}

function markEmailRead(email: Email): void {
  email.read = true;
}

function markTrashed(email: Email): void {
  email.trashed = true;
}
