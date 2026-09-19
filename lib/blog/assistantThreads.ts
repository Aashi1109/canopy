/** Server-only private conversation storage. */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  and,
  db,
  desc,
  eq,
  inArray,
  sql,
  blogPostsTable as posts,
  blogThreadsTable as threads,
  blogRunsTable as runs,
  blogAttachmentsTable as attachments,
  blogMessagesTable as messages,
} from "../../db/index.ts";
import { requireTransactionPermission, writeAudit } from "../admin/adminMutations.ts";
import { supportedArtifact } from "./agentArtifacts.ts";
import { getBlogAgent } from "./agentCatalog.ts";
import { renderBlogDocument, validateBlogDocument } from "./document.ts";
import config from "../config/config.ts";
import { AIClient } from "../ai/client.ts";
import {
  BlogAssistantError,
  assistantId,
  settingsSchema,
  threadPatchSchema,
  validateAssistantImage,
  publicReference,
} from "./assistantValidation.ts";
import type {
  BlogAssistantThread,
  BlogAttachment,
  BlogAssistantRun,
  BlogAssistantAvailability,
  BlogMessage,
  BlogExecutionSummary,
  BlogRunRequest,
  BlogAssistantResult,
} from "./assistantTypes.ts";

export type BlogTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type StoredRun = typeof runs.$inferSelect;
export const ACTIVE_RUN_STATUSES = ["queued", "running", "unknown"] as const;
export const privateExpiry = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
export function threadView(row: typeof threads.$inferSelect): BlogAssistantThread {
  const { composerDraft, composerState, ...settings } = row.settings;
  return {
    id: row.id,
    postId: row.postId,
    title: row.title,
    type: row.type,
    settings: settingsSchema.parse(settings),
    composerDraft: typeof composerDraft === "string" ? composerDraft : "",
    composerState: threadPatchSchema.shape.composerState.catch(undefined).parse(composerState),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function attachmentProvider(data: Record<string, unknown>): { name: string; fileId: string } | null {
  const value = z.object({ name: z.string().min(1), fileId: z.string().min(1) }).safeParse(data.provider);
  return value.success ? value.data : null;
}
export function attachmentView(row: typeof attachments.$inferSelect, full = false): BlogAttachment {
  const data = z
    .object({ url: z.string().optional(), mimeType: z.string().optional(), sizeBytes: z.number().optional() })
    .catch({})
    .parse(row.data);
  if (data.url) {
    try {
      data.url = publicReference(data.url);
    } catch {
      delete data.url;
    }
  }
  return {
    id: row.id,
    threadId: row.threadId,
    messageId: row.messageId,
    runId: row.runId,
    type: row.type,
    label: row.label,
    data: row.type === "artifact" ? artifactData(row.data.artifact, full) : data,
    status: row.status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function artifactData(value: unknown, full: boolean): BlogAttachment["data"] {
  const summary = z
    .object({ agentId: z.string(), summary: z.string().max(2000), schemaVersion: z.number(), agentVersion: z.number() })
    .safeParse(value);
  if (!summary.success) return {};
  return { artifactSummary: summary.data, ...(full && supportedArtifact(value) ? { artifact: value } : {}) };
}
export function executionView(
  row: Pick<
    StoredRun,
    | "id"
    | "operation"
    | "status"
    | "createdAt"
    | "updatedAt"
    | "completedAt"
    | "expiresAt"
    | "errorMessage"
    | "request"
    | "response"
    | "continuation"
  >,
): BlogExecutionSummary {
  const available = row.expiresAt.getTime() > Date.now() && row.continuation.cleared !== true;
  return {
    id: row.id,
    operation: row.operation,
    agentId: available ? row.request.agentId : undefined,
    requestMessage: available ? row.request.message : undefined,
    status: row.status,
    label: available
      ? (row.response?.artifact?.label ?? getBlogAgent(row.request.agentId)?.name ?? "Legacy report")
      : "Expired result",
    artifact: available ? row.response?.artifact : undefined,
    errorMessage: available ? row.errorMessage : "This result has expired.",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}
const pageCursor = (row: { id: string; createdAt: Date }) =>
  Buffer.from(JSON.stringify({ id: row.id })).toString("base64url");
function readCursor(value?: string | null) {
  if (!value) return undefined;
  try {
    if (value.length > 500) throw new Error();
    return z
      .object({ id: assistantId })
      .strict()
      .parse(JSON.parse(Buffer.from(value, "base64url").toString()));
  } catch {
    throw new BlogAssistantError("VALIDATION", "The page cursor is invalid.");
  }
}
async function executionPage(tx: BlogTransaction, actor: string, threadId: string, cursor?: string | null) {
  const after = readCursor(cursor);
  if (after) {
    const [anchor] = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.id, after.id), eq(runs.threadId, threadId), eq(runs.ownerId, actor)));
    if (!anchor) throw new BlogAssistantError("VALIDATION", "This page is no longer available. Refresh the results.");
  }
  const rows = await tx
    .select({
      id: runs.id,
      operation: runs.operation,
      status: runs.status,
      createdAt: runs.createdAt,
      updatedAt: runs.updatedAt,
      completedAt: runs.completedAt,
      expiresAt: runs.expiresAt,
      errorMessage: runs.errorMessage,
      request: sql<BlogRunRequest>`jsonb_build_object('agentId', ${runs.request}->>'agentId', 'message', ${runs.request}->>'message')`,
      response: sql<BlogAssistantResult | null>`CASE WHEN ${runs.response} IS NULL THEN NULL ELSE jsonb_build_object('artifact', ${runs.response}->'artifact') END`,
      continuation: sql<Record<string, unknown>>`'{}'::jsonb`,
    })
    .from(runs)
    .where(
      and(
        eq(runs.threadId, threadId),
        eq(runs.ownerId, actor),
        sql`${runs.operation} IN ('agent','review','optimize','check_sources')`,
        sql`coalesce(${runs.continuation}->>'cleared','false') <> 'true'`,
        after
          ? sql`(${runs.createdAt}, ${runs.id}) < ((SELECT created_at FROM blog_runs WHERE id = ${after.id}), ${after.id})`
          : undefined,
      ),
    )
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(26);
  return {
    executions: rows.slice(0, 25).map(executionView),
    nextCursor: rows.length > 25 ? pageCursor(rows[24]) : null,
  };
}
export async function getThreadExecutions(actor: string, postId: string, threadId: string, cursor?: string | null) {
  return db.transaction(async (tx) => {
    await requireThread(tx, actor, postId, threadId);
    return executionPage(tx, actor, threadId, cursor);
  });
}
export async function listThreadAttachments(
  actor: string,
  postId: string,
  threadId: string,
  kind: string | null,
  cursor?: string | null,
) {
  if (kind !== "sources" && kind !== "artifacts")
    throw new BlogAssistantError("VALIDATION", "Choose sources or artifacts.");
  return db.transaction(async (tx) => {
    await requireThread(tx, actor, postId, threadId);
    const after = readCursor(cursor);
    if (after) {
      const [anchor] = await tx
        .select({ id: attachments.id })
        .from(attachments)
        .where(and(eq(attachments.id, after.id), eq(attachments.threadId, threadId), eq(attachments.ownerId, actor)));
      if (!anchor) throw new BlogAssistantError("VALIDATION", "This page is no longer available. Refresh the library.");
    }
    const rows = await tx
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.threadId, threadId),
          eq(attachments.ownerId, actor),
          kind === "artifacts" ? eq(attachments.type, "artifact") : sql`${attachments.type} IN ('file','link')`,
          sql`${attachments.status} <> 'deleting'`,
          kind === "artifacts"
            ? sql`(${attachments.expiresAt} IS NULL OR ${attachments.expiresAt} > now())`
            : undefined,
          after
            ? sql`(${attachments.createdAt}, ${attachments.id}) < ((SELECT created_at FROM blog_attachments WHERE id = ${after.id}), ${after.id})`
            : undefined,
        ),
      )
      .orderBy(desc(attachments.createdAt), desc(attachments.id))
      .limit(26);
    return {
      attachments: rows.slice(0, 25).map((row) => attachmentView(row)),
      nextCursor: rows.length > 25 ? pageCursor(rows[24]) : null,
    };
  });
}
export async function getThreadAttachment(actor: string, postId: string, threadId: string, id: string) {
  assistantId.parse(id);
  return db.transaction(async (tx) => {
    await requireThread(tx, actor, postId, threadId);
    const [row] = await tx
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.id, id),
          eq(attachments.threadId, threadId),
          eq(attachments.ownerId, actor),
          eq(attachments.status, "ready"),
          sql`(${attachments.expiresAt} IS NULL OR ${attachments.expiresAt} > now())`,
        ),
      );
    if (!row) throw new BlogAssistantError("NOT_FOUND", "This attachment is unavailable or expired.", 404);
    const attachment = attachmentView(row, true);
    const document = attachment.data.artifact?.content.document;
    let html: string | undefined;
    if (document) {
      const validated = validateBlogDocument(document, { cloudName: config.cloudinary.cloudName });
      html = renderBlogDocument(validated, { cloudName: config.cloudinary.cloudName }).html;
    }
    return { attachment, ...(html === undefined ? {} : { html }) };
  });
}
export function messageView(row: typeof messages.$inferSelect): BlogMessage {
  // Provider details stay server-side; only normalized usage and identity are UI metadata.
  const provider = z.object({ name: z.string(), model: z.string().optional() }).safeParse(row.meta.provider);
  const usage = z
    .object({
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    })
    .safeParse(row.meta.usage);
  return {
    ...row,
    meta: { ...(provider.success ? { provider: provider.data } : {}), ...(usage.success ? { usage: usage.data } : {}) },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function runView(row: StoredRun): BlogAssistantRun {
  return {
    id: row.id,
    threadId: row.threadId,
    postId: row.postId,
    operation: row.operation,
    status: row.status,
    provider: row.provider,
    model: row.model,
    request: row.request,
    response: row.response,
    inputMessageId: row.inputMessageId,
    assistantMessageId:
      typeof row.continuation.assistantMessageId === "string" ? row.continuation.assistantMessageId : null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
export function assistantAvailability(): BlogAssistantAvailability {
  try {
    const capabilities = new AIClient(config.ai.provider).getCapabilities();
    const enabled = config.ai.enabled && capabilities.configured;
    return {
      enabled,
      provider: config.ai.provider,
      capabilities,
      reason: enabled ? undefined : "The assistant is not configured. Manual editing remains available.",
    };
  } catch {
    return {
      enabled: false,
      provider: config.ai.provider,
      capabilities: {
        images: false,
        structuredOutput: false,
        webSearch: false,
        urlRetrieval: false,
      },
      reason: "The configured AI provider is unavailable.",
    };
  }
}
export function requireAssistantClient(provider = config.ai.provider) {
  if (!config.ai.enabled)
    throw new BlogAssistantError("UNAVAILABLE", "The assistant is disabled. You can continue writing manually.", 503);
  const client = new AIClient(provider);
  const caps = client.getCapabilities();
  if (!caps.configured)
    throw new BlogAssistantError("UNAVAILABLE", "The provider is not configured for generation.", 503);
  return client;
}
export async function requirePostAccess(tx: BlogTransaction, actor: string, postId: string, edit = false) {
  assistantId.parse(postId);
  await requireTransactionPermission(tx, actor, "blog", "view");
  if (edit) await requireTransactionPermission(tx, actor, "blog", "edit");
  const [post] = await tx.select().from(posts).where(eq(posts.id, postId)).for("share");
  if (!post || post.trashedAt) throw new BlogAssistantError("NOT_FOUND", "Article not found.", 404);
  return post;
}
export async function requireThread(
  tx: BlogTransaction,
  actor: string,
  postId: string,
  threadId: string,
  edit = false,
) {
  await requirePostAccess(tx, actor, postId, edit);
  assistantId.parse(threadId);
  const [thread] = await tx
    .select()
    .from(threads)
    .where(and(eq(threads.id, threadId), eq(threads.postId, postId), eq(threads.ownerId, actor)))
    .for("update");
  if (!thread || thread.updatedAt.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000)
    throw new BlogAssistantError("NOT_FOUND", "This private thread is no longer available.", 404);
  return thread;
}
export async function listThreads(actor: string, postId: string) {
  return db.transaction(async (tx) => {
    await requirePostAccess(tx, actor, postId);
    return (
      await tx
        .select()
        .from(threads)
        .where(
          and(
            eq(threads.ownerId, actor),
            eq(threads.postId, postId),
            sql`${threads.updatedAt} > now() - interval '30 days'`,
          ),
        )
        .orderBy(desc(threads.updatedAt))
    ).map(threadView);
  });
}
export async function createThread(actor: string, postId: string, input: unknown) {
  const value = threadPatchSchema.pick({ title: true, settings: true }).parse(input);
  return db.transaction(async (tx) => {
    await requirePostAccess(tx, actor, postId, true);
    const [thread] = await tx
      .insert(threads)
      .values({
        id: randomUUID(),
        ownerId: actor,
        postId,
        title: value.title ?? "New thread",
        settings: { language: "English", webSearch: false, ...value.settings },
      })
      .returning();
    await writeAudit(tx, actor, "blog.thread.create", "blog_thread", thread.id, { postId });
    return threadView(thread);
  });
}
export async function getThread(actor: string, postId: string, threadId: string) {
  return db.transaction(async (tx) => {
    const thread = await requireThread(tx, actor, postId, threadId);
    const history = await tx
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.threadId, threadId),
          eq(runs.ownerId, actor),
          sql`${runs.operation} NOT IN ('agent','review','optimize','check_sources')`,
          sql`${runs.expiresAt} > now()`,
        ),
      )
      .orderBy(runs.updatedAt);
    const conversation = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.threadId, threadId),
          sql`NOT EXISTS (SELECT 1 FROM blog_runs analysis WHERE analysis.thread_id = ${threadId} AND analysis.operation IN ('agent','review','optimize','check_sources') AND (analysis.id = ${messages.runId} OR analysis.input_message_id = ${messages.id}))`,
          sql`NOT EXISTS (SELECT 1 FROM blog_runs expired WHERE expired.thread_id = ${threadId} AND expired.expires_at <= now() AND (expired.id = ${messages.runId} OR expired.input_message_id = ${messages.id}) AND NOT EXISTS (SELECT 1 FROM blog_runs fresh WHERE fresh.input_message_id = expired.input_message_id AND fresh.expires_at > now()))`,
        ),
      )
      .orderBy(messages.updatedAt);
    const files = await tx
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.threadId, threadId),
          eq(attachments.ownerId, actor),
          sql`${attachments.type} <> 'artifact'`,
          sql`${attachments.status} <> 'deleting'`,
        ),
      )
      .orderBy(attachments.createdAt);
    const selectedArtifactIds = [
      ...new Set([
        ...(threadView(thread).composerState?.attachmentIds ?? []),
        ...conversation.flatMap((message) =>
          message.parts.flatMap((part) => (part.type === "attachment" ? [part.attachmentId] : [])),
        ),
      ]),
    ];
    const selectedArtifacts = selectedArtifactIds.length
      ? await tx
          .select({
            id: attachments.id,
            threadId: attachments.threadId,
            messageId: attachments.messageId,
            runId: attachments.runId,
            ownerId: attachments.ownerId,
            type: attachments.type,
            label: attachments.label,
            status: attachments.status,
            expiresAt: attachments.expiresAt,
            createdAt: attachments.createdAt,
            updatedAt: attachments.updatedAt,
            data: sql<
              Record<string, unknown>
            >`jsonb_build_object('artifact', (${attachments.data}->'artifact') - 'content' - 'inputArtifactIds' - 'baseDocumentFingerprint')`,
          })
          .from(attachments)
          .where(
            and(
              eq(attachments.ownerId, actor),
              eq(attachments.threadId, threadId),
              eq(attachments.type, "artifact"),
              inArray(attachments.id, selectedArtifactIds),
              eq(attachments.status, "ready"),
              sql`${attachments.expiresAt} > now()`,
            ),
          )
      : [];
    const executionResults = await executionPage(tx, actor, threadId);
    return {
      thread: threadView(thread),
      runs: history.map(runView),
      messages: conversation.map(messageView),
      attachments: [...files, ...selectedArtifacts].map((file) => attachmentView(file)),
      executions: executionResults.executions,
      executionsCursor: executionResults.nextCursor,
      ...assistantAvailability(),
    };
  });
}
export async function updateThread(actor: string, postId: string, threadId: string, input: unknown) {
  const value = threadPatchSchema.parse(input);
  return db.transaction(async (tx) => {
    const thread = await requireThread(tx, actor, postId, threadId, true);
    const [updated] = await tx
      .update(threads)
      .set({
        title: value.title ?? thread.title,
        settings: {
          ...thread.settings,
          ...value.settings,
          ...(value.composerDraft === undefined ? {} : { composerDraft: value.composerDraft }),
          ...(value.composerState === undefined ? {} : { composerState: value.composerState }),
        },
        updatedAt: new Date(),
      })
      .where(eq(threads.id, threadId))
      .returning();
    return threadView(updated);
  });
}
/** Erase private content immediately; retain only provider cleanup references on failure. */
export async function removeThreadHistory(actor: string, postId: string, threadId: string, removeThread = false) {
  const removed = await db.transaction(async (tx) => {
    const thread = await requireThread(tx, actor, postId, threadId, true);
    const [upload] = await tx
      .select({ id: attachments.id })
      .from(attachments)
      .where(and(eq(attachments.threadId, threadId), eq(attachments.status, "processing")))
      .limit(1);
    if (upload)
      throw new BlogAssistantError(
        "CONFLICT",
        "Wait for the attachment upload to finish before clearing its resources.",
        409,
      );
    const files = await tx.select().from(attachments).where(eq(attachments.threadId, threadId));
    const history = await tx.select().from(runs).where(eq(runs.threadId, threadId));
    const expired = new Date(0);
    await tx.delete(attachments).where(and(eq(attachments.threadId, threadId), eq(attachments.type, "artifact")));
    await tx.update(attachments).set({ messageId: null }).where(eq(attachments.threadId, threadId));
    await tx.update(runs).set({ inputMessageId: null }).where(eq(runs.threadId, threadId));
    await tx.delete(messages).where(eq(messages.threadId, threadId));
    await tx
      .update(attachments)
      .set({ status: "deleting", expiresAt: expired, updatedAt: new Date() })
      .where(eq(attachments.threadId, threadId));
    for (const run of history)
      await tx
        .update(runs)
        .set({
          expiresAt: expired,
          request: { clientRequestId: run.clientRequestId, operation: run.operation, message: "Cleared content" },
          response: null,
          usage: null,
          errorMessage: null,
          continuation: {
            ...run.continuation,
            contentExpired: false,
            cleared: true,
            messages: [],
            calls: [],
            proposals: [],
            citations: [],
            retainUntil: run.continuation.retainUntil ?? run.expiresAt.toISOString(),
          },
        })
        .where(eq(runs.id, run.id));
    await tx
      .update(threads)
      .set({
        updatedAt: removeThread ? expired : new Date(),
        settings: removeThread ? {} : { ...thread.settings, composerDraft: "", composerState: { attachmentIds: [] } },
        ...(removeThread ? { title: "Deleted thread" } : {}),
      })
      .where(eq(threads.id, threadId));
    await writeAudit(tx, actor, removeThread ? "blog.thread.delete" : "blog.thread.clear", "blog_thread", threadId, {
      postId,
    });
    return { files: files.filter((file) => file.type !== "artifact"), history };
  });
  for (const file of removed.files) {
    try {
      const provider = attachmentProvider(file.data);
      if (provider) await new AIClient(provider.name).deleteFile(provider.fileId);
      await db.delete(attachments).where(eq(attachments.id, file.id));
    } catch {
      /* Scheduled cleanup retries retained private file handles. */
    }
  }
  for (const run of removed.history) {
    try {
      await deleteRunResponses(run);
      await db.delete(runs).where(eq(runs.id, run.id));
    } catch {
      /* Content is erased; scheduled cleanup retries opaque response handles. */
    }
  }
  if (removeThread)
    await db
      .delete(threads)
      .where(
        and(
          eq(threads.id, threadId),
          sql`NOT EXISTS (SELECT 1 FROM blog_runs WHERE thread_id = ${threadId}) AND NOT EXISTS (SELECT 1 FROM blog_attachments WHERE thread_id = ${threadId})`,
        ),
      );
}
export async function deleteRunResponses(run: StoredRun) {
  if (run.continuation.providerDeleted === true) return;
  const handles = z.array(z.string()).catch([]).parse(run.continuation.handles);
  for (const id of new Set([...handles, ...(run.providerResponseId ? [run.providerResponseId] : [])]))
    await new AIClient(run.provider).deleteResponse(id);
}
export async function uploadAttachment(actor: string, postId: string, threadId: string, file: File) {
  if (file.name.length > 255 || !file.name.trim())
    throw new BlogAssistantError("VALIDATION", "Choose an image with a valid filename.");
  if (file.size > 5 * 1024 * 1024) throw new BlogAssistantError("VALIDATION", "Images must be at most 5 MiB.");
  const data = new Uint8Array(await file.arrayBuffer());
  validateAssistantImage(data, file.type);
  const client = requireAssistantClient();
  if (!client.getCapabilities().images)
    throw new BlogAssistantError("CAPABILITY", "This provider does not support images.");
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await requireThread(tx, actor, postId, threadId, true);
    await tx.insert(attachments).values({
      id,
      threadId,
      ownerId: actor,
      type: "file",
      label: file.name,
      data: { mimeType: file.type, sizeBytes: file.size, provider: { name: config.ai.provider } },
      status: "processing",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  });
  try {
    const uploaded = await client.uploadFile({ data, filename: file.name, mimeType: file.type });
    // Save the provider reference even if permissions changed during upload, so cleanup can delete it.
    await db
      .update(attachments)
      .set({
        data: {
          mimeType: file.type,
          sizeBytes: file.size,
          provider: { name: config.ai.provider, fileId: uploaded.id, details: {} },
        },
        updatedAt: new Date(),
      })
      .where(eq(attachments.id, id));
    return await db.transaction(async (tx) => {
      await requireThread(tx, actor, postId, threadId, true);
      const [row] = await tx
        .update(attachments)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(attachments.id, id))
        .returning();
      await writeAudit(tx, actor, "blog.attachment.upload", "blog_attachment", id, {
        postId,
        threadId,
        provider: config.ai.provider,
      });
      return attachmentView(row);
    });
  } catch (error) {
    await db.update(attachments).set({ status: "failed", updatedAt: new Date() }).where(eq(attachments.id, id));
    throw error;
  }
}
export async function removeAttachment(actor: string, postId: string, threadId: string, id: string) {
  assistantId.parse(id);
  const file = await db.transaction(async (tx) => {
    await requireThread(tx, actor, postId, threadId, true);
    const [row] = await tx
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.threadId, threadId), eq(attachments.ownerId, actor)))
      .for("update");
    if (!row) throw new BlogAssistantError("NOT_FOUND", "Attachment not found.", 404);
    if (row.messageId || row.type === "artifact")
      throw new BlogAssistantError(
        "CONFLICT",
        "Sent attachments belong to message history. Clear the thread to remove them.",
        409,
      );
    if (row.status === "processing")
      throw new BlogAssistantError("CONFLICT", "Wait for attachment preparation to finish.", 409);
    await tx.update(attachments).set({ status: "deleting", updatedAt: new Date() }).where(eq(attachments.id, id));
    return row;
  });
  const provider = attachmentProvider(file.data);
  if (provider) await new AIClient(provider.name).deleteFile(provider.fileId);
  await db.transaction(async (tx) => {
    await tx.delete(attachments).where(eq(attachments.id, id));
    await writeAudit(tx, actor, "blog.attachment.delete", "blog_attachment", id, { threadId });
  });
}
export async function attachmentsForRun(
  tx: BlogTransaction,
  actor: string,
  threadId: string,
  provider: string,
  ids: string[],
  inputMessageId?: string,
  agentInput = false,
) {
  if (!ids.length) return [];
  const files = await tx
    .select()
    .from(attachments)
    .where(and(inArray(attachments.id, ids), eq(attachments.threadId, threadId), eq(attachments.ownerId, actor)))
    .for("update");
  if (
    files.length !== ids.length ||
    files.some(
      (f) =>
        f.status !== "ready" ||
        (f.expiresAt !== null && f.expiresAt.getTime() <= Date.now()) ||
        (!agentInput && f.type !== "artifact" && f.messageId !== null && f.messageId !== inputMessageId) ||
        (f.type === "file" && attachmentProvider(f.data)?.name !== provider) ||
        (f.type === "link" && !z.object({ url: z.string() }).safeParse(f.data).success) ||
        (f.type === "artifact" && !supportedArtifact(f.data.artifact)) ||
        !["file", "link", "artifact"].includes(f.type),
    )
  )
    throw new BlogAssistantError(
      "VALIDATION",
      "An attachment is unavailable or belongs to another provider. Upload it again in this thread.",
    );
  for (const file of files) if (file.type === "link") publicReference(String(file.data.url));
  await tx
    .update(attachments)
    .set({ expiresAt: privateExpiry() })
    .where(
      and(
        inArray(attachments.id, ids),
        sql`${attachments.expiresAt} IS NOT NULL`,
        sql`${attachments.type} <> 'artifact'`,
      ),
    );
  return files;
}

export async function createLinkAttachment(actor: string, postId: string, threadId: string, input: unknown) {
  const value = z
    .object({ type: z.literal("link"), label: z.string().trim().min(1).max(255).optional(), url: z.string().max(2048) })
    .strict()
    .parse(input);
  const url = publicReference(value.url);
  return db.transaction(async (tx) => {
    await requireThread(tx, actor, postId, threadId, true);
    const [row] = await tx
      .insert(attachments)
      .values({
        id: randomUUID(),
        threadId,
        ownerId: actor,
        type: "link",
        label: value.label ?? new URL(url).hostname,
        data: { url },
        status: "ready",
      })
      .returning();
    await writeAudit(tx, actor, "blog.attachment.create", "blog_attachment", row.id, {
      threadId,
      postId,
      type: "link",
    });
    return attachmentView(row);
  });
}
