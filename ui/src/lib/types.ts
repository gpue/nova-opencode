export type Lane = "later" | "next" | "now";

export interface SessionSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: string | null;
  lane: Lane;
  archived: boolean;
  running: boolean;
  messageCount: number;
}

export interface BoardData {
  lanes: Record<Lane, SessionSummary[]>;
  archiveCount: number;
}

export interface SessionMessagePart {
  id?: string;
  type?: string;
  text?: string;
  [key: string]: unknown;
}

export interface SessionMessage {
  id: string;
  role?: string;
  createdAt?: string;
  parts?: SessionMessagePart[];
  [key: string]: unknown;
}

export interface SessionDetail {
  id: string;
  title: string;
  updatedAt: string | null;
  messages: SessionMessage[];
}
