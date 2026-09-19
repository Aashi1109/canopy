import type { BlogArtifact, BlogArtifactReference } from "./agentArtifacts.ts";
import type { BlogDocument, BlogNode } from "./document.ts";
import type { JSONContent } from "@tiptap/core";

export type BlogOperation = "generate" | "chat" | "rewrite" | "review" | "optimize" | "check_sources" | "agent";
export type BlogRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "unknown";
export type BlogRequestSettings = {
  language?: string;
  tone?: string;
  length?: string;
  keyword?: string;
  audience?: string;
  webSearch?: boolean;
};
export type BlogSelection = { from: number; to: number; text: string };
export type BlogRunRequest = {
  clientRequestId: string;
  operation: BlogOperation;
  agentId?: string;
  message: string;
  postId?: string;
  threadId?: string;
  inputMessageId?: string;
  selectedText?: string;
  editorJson?: BlogNode;
  document?: BlogDocument;
  settings?: BlogRequestSettings;
  references?: string[];
  attachmentIds?: string[];
};
export type BlogProposal = {
  toolCallId: string;
  type: "edit" | "seo";
  status: "pending" | "applied" | "discarded" | "stale" | "failed";
  action?: "insert" | "replace" | "delete";
  title?: string;
  placement?: string;
  originalText?: string;
  replacement?: BlogNode[];
  seoTitle?: string;
  seoDescription?: string;
};
export type BlogAssistantResult = {
  text: string;
  keywords: string[];
  findings: Array<{ text: string; status?: "supported" | "unresolved" | "matching"; urls?: string[] }>;
  citations: Array<{ url: string; title: string }>;
  proposals: BlogProposal[];
  searchStatus: "not_requested" | "completed" | "failed";
  artifact?: BlogArtifactReference;
};
export type BlogAssistantRun = {
  id: string;
  threadId: string | null;
  postId: string | null;
  operation: BlogOperation;
  status: BlogRunStatus;
  provider: string;
  model: string;
  inputMessageId: string | null;
  assistantMessageId: string | null;
  request: BlogRunRequest;
  response: BlogAssistantResult | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
export type BlogComposerSelection = {
  agentId?: string;
  /** UTF-16 offset into the plain composer instruction; legacy selections start at zero. */
  agentOffset?: number;
  content?: JSONContent;
  attachmentIds: string[];
};
export type BlogAssistantThread = {
  id: string;
  postId: string;
  title: string;
  type: "chat" | "inline";
  settings: BlogRequestSettings;
  composerDraft: string;
  composerState?: BlogComposerSelection;
  createdAt: string;
  updatedAt: string;
};
export type BlogAttachment = {
  id: string;
  threadId: string;
  messageId: string | null;
  runId?: string | null;
  type: string;
  label: string;
  data: {
    url?: string;
    mimeType?: string;
    sizeBytes?: number;
    artifact?: BlogArtifact;
    artifactSummary?: { agentId: string; summary: string; schemaVersion: number; agentVersion: number };
  };
  status: "processing" | "ready" | "failed" | "deleting";
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type BlogMessagePart =
  | { type: "text"; text: string }
  | { type: "attachment"; attachmentId: string }
  | { type: "tool-call"; id: string; name: string; input: unknown }
  | { type: "tool-result"; id: string; name: string; output: unknown }
  | { type: "proposal"; proposal: BlogProposal };
export type BlogMessage = {
  id: string;
  threadId: string;
  runId: string | null;
  role: "user" | "assistant";
  parts: BlogMessagePart[];
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
export type BlogRunEvent =
  | { type: "run"; run: BlogAssistantRun }
  | { type: "text-delta"; text: string }
  | { type: "text"; text: string }
  | { type: "proposal"; proposal: BlogProposal }
  | { type: "completed"; run: BlogAssistantRun }
  | { type: "error"; message: string; run?: BlogAssistantRun };
export type BlogAssistantAvailability = {
  enabled: boolean;
  provider: string;
  capabilities: {
    images: boolean;
    structuredOutput: boolean;
    webSearch: boolean;
    urlRetrieval: boolean;
  };
  reason?: string;
};
export type BlogExecutionSummary = {
  id: string;
  requestMessage?: string;
  agentId?: string;
  operation: BlogOperation;
  status: BlogRunStatus;
  label: string;
  artifact?: BlogArtifactReference;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  expiresAt: string;
};
export type BlogThreadDetail = {
  thread: BlogAssistantThread;
  runs: BlogAssistantRun[];
  messages: BlogMessage[];
  attachments: BlogAttachment[];
  executions?: BlogExecutionSummary[];
  executionsCursor?: string | null;
} & BlogAssistantAvailability;
