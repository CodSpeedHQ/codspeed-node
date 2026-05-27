export { Inbox } from "./inbox.ts";
export {
  closeDatabase,
  type Db,
  openDatabase,
  type SyncResult,
  syncStateToDisk,
} from "./persistence.ts";
export { generateEmails, type SeedOptions } from "./seed.ts";
export {
  type Action,
  type AppState,
  makeInitialState,
  type PendingOp,
  reduce,
} from "./store.ts";
export type {
  Address,
  Email,
  EmailId,
  LabelId,
  Thread,
  ThreadId,
} from "./types.ts";
