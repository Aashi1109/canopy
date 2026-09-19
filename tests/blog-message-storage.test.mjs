import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { shortCircuit: true, url: "data:text/javascript,export {};" };
    if (specifier.startsWith("@/")) return next(new URL("../" + specifier.slice(2), import.meta.url).href, context);
    return next(specifier, context);
  },
});
const { attachmentView, attachmentProvider, messageView, attachmentsForRun } =
  await import("../lib/blog/assistantThreads.ts");
const { startBlogRun } = await import("../lib/blog/assistantRuns.ts");
const { db, blogThreadsTable, blogMessagesTable } = await import("../db/index.ts");
const { AIClient } = await import("../lib/ai/client.ts");
const { ADMIN_ACCESS } = await import("../lib/authorization/index.ts");
const date = new Date("2026-09-18T00:00:00Z");
const attachment = {
  id: "file",
  threadId: "thread",
  messageId: null,
  ownerId: "owner",
  type: "file",
  label: "image.png",
  data: {
    mimeType: "image/png",
    sizeBytes: 128,
    storageKey: "private/key",
    provider: { name: "openai", fileId: "private-file", details: { secret: "not-for-client" } },
  },
  status: "ready",
  expiresAt: null,
  createdAt: date,
  updatedAt: date,
};

test("attachment views expose display fields without provider/storage credentials", () => {
  const view = attachmentView(attachment);
  assert.deepEqual(view.data, { mimeType: "image/png", sizeBytes: 128 });
  assert.equal(view.expiresAt, null);
  assert.equal(
    attachmentView({ ...attachment, type: "link", data: { url: "javascript:alert(1)" } }).data.url,
    undefined,
  );
  assert.deepEqual(attachmentProvider(attachment.data), { name: "openai", fileId: "private-file" });
  assert.equal(attachmentProvider({ provider: { fileId: "missing-provider-name" } }), null);
  assert.equal(attachmentProvider({ provider: null }), null);
});
test("message views preserve content and usage but omit raw provider details", () => {
  const parts = [{ type: "text", text: "Answer" }];
  const view = messageView({
    id: "m",
    threadId: "t",
    runId: "r",
    role: "assistant",
    parts,
    meta: {
      usage: { totalTokens: 12 },
      provider: { name: "openai", model: "configured", responseId: "private", details: { headers: "private" } },
    },
    createdAt: date,
    updatedAt: date,
  });
  assert.deepEqual(view.parts, parts);
  assert.deepEqual(view.meta, { usage: { totalTokens: 12 }, provider: { name: "openai", model: "configured" } });
});
function transaction(rows) {
  return {
    select() {
      return {
        from() {
          return {
            where() {
              return { for: async () => rows };
            },
          };
        },
      };
    },
    update() {
      return {
        set() {
          return { where: async () => {} };
        },
      };
    },
  };
}
test("attachment preparation allows links and same-input retry but rejects cross-message reuse", async () => {
  const link = { ...attachment, id: "link", type: "link", data: { url: "https://openai.com/article" } };
  assert.equal((await attachmentsForRun(transaction([link]), "owner", "thread", "other-provider", ["link"])).length, 1);
  const sent = { ...attachment, messageId: "input" };
  await assert.rejects(attachmentsForRun(transaction([sent]), "owner", "thread", "openai", ["file"]), /unavailable/i);
  assert.equal(
    (await attachmentsForRun(transaction([sent]), "owner", "thread", "openai", ["file"], "input")).length,
    1,
  );
  for (const row of [
    { ...attachment, status: "processing" },
    { ...attachment, expiresAt: new Date(0) },
    { ...attachment, data: { provider: { name: "openai" } } },
    { ...attachment, type: "unsupported" },
  ])
    await assert.rejects(attachmentsForRun(transaction([row]), "owner", "thread", "openai", ["file"]), /unavailable/i);
  await assert.rejects(
    attachmentsForRun(transaction([attachment]), "owner", "thread", "different", ["file"]),
    /unavailable/i,
  );
});

test("first send titles a provisional thread immediately and later sends preserve its title", async () => {
  const previous = {
    transaction: db.transaction,
    enabled: process.env.AI_ENABLED,
    capabilities: AIClient.prototype.getCapabilities,
  };
  const thread = {
    id: "thread",
    postId: "post",
    ownerId: "owner",
    title: "New thread",
    settings: {},
    updatedAt: new Date(),
  };
  const permission = [
    {
      status: "active",
      roleId: "admin",
      roleName: "Admin",
      roleDescription: "Admin",
      roleAccess: ADMIN_ACCESS,
      roleIsSystem: true,
    },
  ];
  const userMessages = [];
  let reads = [];
  const tx = {
    execute: async () => {},
    select() {
      const chain = {
        from: () => chain,
        where: () => chain,
        innerJoin: () => chain,
        for: () => chain,
        limit: () => chain,
        then(resolve, reject) {
          assert.ok(reads.length, "Unexpected database read");
          return Promise.resolve(reads.shift()).then(resolve, reject);
        },
      };
      return chain;
    },
    insert(table) {
      return {
        values(value) {
          if (table === blogMessagesTable && value.role === "user") userMessages.push(value);
          return { returning: async () => [value] };
        },
      };
    },
    update(table) {
      return {
        set(value) {
          return {
            where: async () => {
              if (table === blogThreadsTable) Object.assign(thread, value);
            },
          };
        },
      };
    },
  };
  db.transaction = async (callback) => callback(tx);
  process.env.AI_ENABLED = "true";
  AIClient.prototype.getCapabilities = () => ({ configured: true, model: "fixture", images: true });
  try {
    for (const [index, message] of ["How can I improve\n this draft?", "Now shorten the introduction"].entries()) {
      reads = [
        [],
        permission,
        permission,
        [{ id: "post", trashedAt: null }],
        [thread],
        userMessages.map(({ id }) => ({ id })),
        [],
      ];
      const { run } = await startBlogRun("owner", {
        operation: "chat",
        clientRequestId: `request-${index}`,
        postId: "post",
        threadId: "thread",
        message,
        editorJson: { type: "doc", content: [] },
      });
      assert.equal(run.status, "queued");
      assert.equal(thread.title, "How can I improve this draft?");
      assert.equal(userMessages.length, index + 1);
      assert.equal(reads.length, 0);
    }
  } finally {
    db.transaction = previous.transaction;
    if (previous.enabled === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = previous.enabled;
    AIClient.prototype.getCapabilities = previous.capabilities;
  }
});

test("agent reuse accepts prior sources but artifacts remain immutable and expire before reuse", async () => {
  const sent = { ...attachment, messageId: "old-message" };
  assert.equal(
    (await attachmentsForRun(transaction([sent]), "owner", "thread", "openai", ["file"], undefined, true)).length,
    1,
  );
  const artifact = {
    ...attachment,
    id: "report",
    type: "artifact",
    messageId: null,
    data: {
      artifact: {
        schemaVersion: 1,
        agentVersion: 1,
        agentId: "auditor",
        summary: "Review",
        inputArtifactIds: [],
        content: { sections: [{ heading: "Structure", text: "Clear" }] },
      },
    },
  };
  assert.equal((await attachmentsForRun(transaction([artifact]), "owner", "thread", "openai", ["report"])).length, 1);
  await assert.rejects(
    attachmentsForRun(
      transaction([{ ...artifact, expiresAt: new Date(0) }]),
      "owner",
      "thread",
      "openai",
      ["report"],
      undefined,
      true,
    ),
    /unavailable/,
  );
  await assert.rejects(
    attachmentsForRun(
      transaction([{ ...artifact, data: { artifact: { ...artifact.data.artifact, agentVersion: 2 } } }]),
      "owner",
      "thread",
      "openai",
      ["report"],
      undefined,
      true,
    ),
    /unavailable/,
  );
});
