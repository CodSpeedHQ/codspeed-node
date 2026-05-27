export type EmailId = string;
export type ThreadId = string;
export type LabelId = string;

export interface Address {
  name: string;
  email: string;
}

export interface Email {
  id: EmailId;
  threadId: ThreadId;
  inReplyTo: EmailId | null;
  references: EmailId[];
  from: Address;
  to: Address[];
  cc: Address[];
  subject: string;
  body: string;
  snippet: string;
  receivedAt: number;
  read: boolean;
  starred: boolean;
  archived: boolean;
  trashed: boolean;
  labels: LabelId[];
  sizeBytes: number;
}

export interface Thread {
  id: ThreadId;
  emails: Email[];
  subject: string;
  participants: Address[];
  lastReceivedAt: number;
  unreadCount: number;
}
