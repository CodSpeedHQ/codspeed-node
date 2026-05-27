import type { Email, EmailId } from "./types.ts";

/**
 * Redux-like store. Immutable state, pure reducer, action log.
 *
 * Designed so the flamegraph shows a chain of named frames per dispatch:
 *   dispatch -> reduce -> reduceMutation -> applyMutationToEmails
 *               -> applyXToEmail (map callback)
 *               -> enqueuePendingOp -> makePendingOp
 *
 * Each `.map`/`.filter` callback below is a named function expression — V8
 * cannot inline through the C++ iteration boundary, so the named frame
 * survives in the profile.
 */

export interface AppState {
  emails: Email[];
  pendingOps: PendingOp[];
  lastSyncedAt: number | null;
}

export interface PendingOp {
  id: string;
  type: "archive" | "markRead" | "trash";
  ids: EmailId[];
  at: number;
}

export type Action =
  | { type: "ARCHIVE"; ids: EmailId[]; at: number }
  | { type: "MARK_READ"; ids: EmailId[]; at: number }
  | { type: "TRASH"; ids: EmailId[]; at: number }
  | { type: "SYNC_FLUSHED"; flushedOpIds: string[]; at: number };

export function makeInitialState(emails: Email[]): AppState {
  return { emails, pendingOps: [], lastSyncedAt: null };
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "ARCHIVE":
      return reduceMutation(state, action, "archive", applyArchiveToEmail);
    case "MARK_READ":
      return reduceMutation(state, action, "markRead", applyMarkReadToEmail);
    case "TRASH":
      return reduceMutation(state, action, "trash", applyTrashToEmail);
    case "SYNC_FLUSHED":
      return reduceSyncFlushed(state, action);
  }
}

function reduceMutation(
  state: AppState,
  action: { ids: EmailId[]; at: number },
  opType: "archive" | "markRead" | "trash",
  applyToEmail: (email: Email) => Email,
): AppState {
  const updatedEmails = applyMutationToEmails(state.emails, action.ids, applyToEmail);
  const enqueuedOps = enqueuePendingOp(
    state.pendingOps,
    makePendingOp(opType, action.ids, action.at),
  );
  return {
    ...state,
    emails: updatedEmails,
    pendingOps: enqueuedOps,
  };
}

export function applyMutationToEmails(
  emails: Email[],
  ids: EmailId[],
  applyToEmail: (email: Email) => Email,
): Email[] {
  return emails.map(function applyMutationIfTargeted(email) {
    if (targetsEmail(ids, email.id)) return applyToEmail(email);
    return email;
  });
}

function targetsEmail(ids: EmailId[], target: EmailId): boolean {
  return ids.includes(target);
}

function applyArchiveToEmail(email: Email): Email {
  return { ...email, archived: true };
}

function applyMarkReadToEmail(email: Email): Email {
  return { ...email, read: true };
}

function applyTrashToEmail(email: Email): Email {
  return { ...email, trashed: true };
}

function enqueuePendingOp(existing: PendingOp[], op: PendingOp): PendingOp[] {
  return [...existing, op];
}

let opIdCounter = 0;
function makePendingOp(type: PendingOp["type"], ids: EmailId[], at: number): PendingOp {
  opIdCounter++;
  return { id: `op_${opIdCounter.toString(36)}`, type, ids, at };
}

function reduceSyncFlushed(
  state: AppState,
  action: { flushedOpIds: string[]; at: number },
): AppState {
  return {
    ...state,
    pendingOps: dropFlushedOps(state.pendingOps, action.flushedOpIds),
    lastSyncedAt: action.at,
  };
}

function dropFlushedOps(pending: PendingOp[], flushedIds: string[]): PendingOp[] {
  return pending.filter(function pendingOpIsNotFlushed(op) {
    return !opIsFlushed(flushedIds, op.id);
  });
}

function opIsFlushed(flushed: string[], opId: string): boolean {
  return flushed.includes(opId);
}
