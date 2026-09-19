import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import pg from "pg";

const url = process.env.BLOG_TEST_DATABASE_URL;
test(
  "streamed blog conversations persist messages and preserve request identity",
  { skip: url ? false : "set BLOG_TEST_DATABASE_URL to a disposable PostgreSQL database" },
  async (t) => {
    const schema = `blog_assistant_${randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    const target = new URL(url);
    target.searchParams.set("options", `-c search_path=${schema}`);
    const previous = Object.fromEntries(
      ["DATABASE_URL", "AI_ENABLED", "OPENAI_API_KEY"].map((key) => [key, process.env[key]]),
    );
    process.env.DATABASE_URL = target.toString();
    process.env.AI_ENABLED = "true";
    process.env.OPENAI_API_KEY = "fixture-only";
    const pool = new pg.Pool({ connectionString: target.toString(), max: 5 });
    const hooks = registerHooks({
      resolve(specifier, context, next) {
        if (specifier === "server-only") return { shortCircuit: true, url: "data:text/javascript,export {};" };
        if (specifier.startsWith("@/")) return next(new URL("../" + specifier.slice(2), import.meta.url).href, context);
        return next(specifier, context);
      },
    });
    const { AIClient } = await import("../lib/ai/client.ts");
    const original = Object.fromEntries(
      ["stream", "generate", "uploadFile", "deleteFile", "deleteResponse"].map((key) => [key, AIClient.prototype[key]]),
    );
    const { sqlClient } = await import("../db/index.ts");
    t.after(async () => {
      await sqlClient.end();
      await pool.end();
      Object.assign(AIClient.prototype, original);
      hooks.deregister();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    for (const file of [
      "0001-baseline/0001_auth_control_plane.sql",
      "0001-baseline/0006_blogs.sql",
      "0003-blog-assistant/0001_blog_assistant.sql",
      "0004-inline-blog-rewrites/0001_inline_blog_rewrites.sql",
      "0005-blog-messages/0001_blog_messages.sql",
      "0006-blog-agent-artifacts/0001_blog_agent_artifacts.sql",
    ])
      await pool.query(await readFile(new URL(`../db/migration/${file}`, import.meta.url), "utf8"));
    await pool.query(
      await readFile(
        new URL("../db/migration/0006-blog-agent-artifacts/0001_blog_agent_artifacts.sql", import.meta.url),
        "utf8",
      ),
    );
    await pool.query(
      "INSERT INTO auth_users(id,name,email) VALUES ('a','Author A','a@test.invalid'),('b','Author B','b@test.invalid')",
    );
    await pool.query("INSERT INTO user_roles(user_id,role_id) VALUES ('a','admin'),('b','admin')");
    const scenarios = [];
    const providerRequests = [];
    let submissions = 0;
    const result = (values = {}) => ({
      id: randomUUID(),
      provider: "openai",
      model: "actual-model",
      status: "completed",
      text: "Answer",
      output: null,
      toolCalls: [],
      citations: [],
      metadata: {},
      usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
      ...values,
    });
    AIClient.prototype.stream = async function* (request) {
      submissions++;
      providerRequests.push(request);
      const scenario = scenarios.shift() ?? {};
      const value = result(scenario.result);
      scenario.started?.();
      yield {
        type: "response",
        response: { id: value.id, provider: value.provider, model: value.model, status: "running" },
      };
      yield { type: "text-delta", text: scenario.delta ?? value.text };
      if (scenario.wait) await scenario.wait;
      if (scenario.tool) {
        const tool = scenario.tool;
        const output = await request.tools[tool.name].execute(tool.input, { toolCallId: tool.id });
        value.toolCalls.push({ ...tool, output });
      }
      if (scenario.fail) throw scenario.fail;
      yield {
        type: "completed",
        get result() {
          scenario.afterReceived?.();
          return value;
        },
      };
    };
    AIClient.prototype.generate = async () =>
      result({
        text: "Short generated title",
        model: "title-model",
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      });
    AIClient.prototype.uploadFile = async (file) => ({
      id: randomUUID(),
      provider: "openai",
      filename: file.filename,
      sizeBytes: file.data.length,
    });
    AIClient.prototype.deleteFile = async () => {};
    AIClient.prototype.deleteResponse = async () => {};
    const threads = await import("../lib/blog/assistantThreads.ts");
    const runs = await import("../lib/blog/assistantRuns.ts");
    const { createBlogPost } = await import("../lib/blog/mutations.ts");
    const post = await createBlogPost("a", { title: "Working article" });
    const first = await threads.createThread("a", post.id, {});
    const second = await threads.createThread("a", post.id, {});
    const request = (extra = {}) => ({
      clientRequestId: randomUUID(),
      operation: "chat",
      message: "Help with this draft",
      postId: post.id,
      threadId: first.id,
      editorJson: post.draftDocument.body,
      ...extra,
    });
    const readEvents = async (response) => (await response.text()).trim().split("\n").filter(Boolean).map(JSON.parse);
    const complete = async (input, scenario = {}, signal = new AbortController().signal) => {
      scenarios.push(scenario);
      const events = await readEvents(await runs.streamBlogRun("a", input, signal));
      const completed = events.find((event) => event.type === "completed");
      assert.ok(completed, JSON.stringify(events));
      return completed.run;
    };
    await t.test("multiple threads remain private to their owner and post", async () => {
      assert.equal((await threads.listThreads("a", post.id)).length, 2);
      assert.equal((await threads.listThreads("b", post.id)).length, 0);
      await assert.rejects(threads.getThread("b", post.id, first.id), { code: "NOT_FOUND" });
      const other = await createBlogPost("a", { title: "Other" });
      await assert.rejects(threads.getThread("a", other.id, first.id), { code: "NOT_FOUND" });
    });
    await t.test("same ID reserves one execution while different requests may run in parallel", async () => {
      const input = request({ threadId: second.id });
      const before = submissions;
      const [one, two] = await Promise.all([runs.startBlogRun("a", input), runs.startBlogRun("a", input)]);
      assert.equal(one.run.id, two.run.id);
      assert.equal(Number(one.fresh) + Number(two.fresh), 1);
      assert.equal(submissions, before);
      assert.ok(one.run.inputMessageId);
      assert.ok(one.run.continuation.assistantMessageId);
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM blog_messages WHERE thread_id=$1", [second.id])).rows[0].n,
        2,
      );
      await assert.rejects(runs.startBlogRun("a", { ...input, message: "Changed" }), { code: "CONFLICT" });
      const parallel = await runs.startBlogRun("a", request({ threadId: second.id }));
      assert.notEqual(parallel.run.id, one.run.id);
      const duplicate = await readEvents(await runs.streamBlogRun("a", input, new AbortController().signal));
      assert.ok(duplicate.some((event) => event.type === "error"));
      assert.equal(submissions, before);
      await assert.rejects(runs.getBlogRun("b", one.run.id), { code: "NOT_FOUND" });
    });
    await t.test("chat deltas precede persistence and plain prose plus usage are stored in messages", async () => {
      let release;
      const wait = new Promise((resolve) => {
        release = resolve;
      });
      const text = 'Literal JSON {"text":"example"}\nSecond line';
      scenarios.push({ wait, delta: "Literal JSON", result: { text } });
      const input = request();
      const response = await runs.streamBlogRun("a", input, new AbortController().signal);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const initial = JSON.parse(decoder.decode((await reader.read()).value).trim());
      const delta = JSON.parse(decoder.decode((await reader.read()).value).trim());
      assert.equal(delta.type, "text-delta");
      assert.equal((await runs.getBlogRun("a", initial.run.id)).status, "running");
      release();
      let rest = "";
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        rest += decoder.decode(next.value);
      }
      assert.ok(rest.includes('"type":"completed"'));
      const detail = await threads.getThread("a", post.id, first.id);
      const assistant = detail.messages.find((message) => message.runId === initial.run.id);
      assert.deepEqual(assistant.parts, [{ type: "text", text }]);
      assert.deepEqual(assistant.meta.usage, { inputTokens: 8, outputTokens: 4, totalTokens: 12 });
      assert.equal(assistant.meta.provider.model, "actual-model");
      assert.equal(providerRequests.at(-1).schema, undefined);
      const before = submissions;
      const repeated = await readEvents(await runs.streamBlogRun("a", input, new AbortController().signal));
      assert.equal(repeated.at(-1).run.response.text, text);
      assert.equal(submissions, before);
    });
    await t.test(
      "an incomplete provider result fails without exposing a completed answer and retains usage",
      async () => {
        scenarios.push({ result: { status: "failed", text: "Partial answer" } });
        const events = await readEvents(await runs.streamBlogRun("a", request(), new AbortController().signal));
        assert.equal(
          events.some((event) => event.type === "completed"),
          false,
        );
        const failed = events.find((event) => event.type === "error").run;
        assert.equal(failed.status, "failed");
        assert.equal(failed.response, null);
        const message = (await threads.getThread("a", post.id, first.id)).messages.find(
          (item) => item.runId === failed.id,
        );
        assert.deepEqual(message.parts, []);
        assert.deepEqual(message.meta.usage, { inputTokens: 8, outputTokens: 4, totalTokens: 12 });
        assert.equal(message.meta.provider.model, "actual-model");
      },
    );
    await t.test(
      "inline creates its own thread and persists proposal decisions without mutating the article",
      async () => {
        const input = request({
          operation: "rewrite",
          threadId: undefined,
          editorJson: undefined,
          selectedText: "Original text",
        });
        const run = await complete(input, {
          result: {
            output: {
              originalText: "Original text",
              blocks: [{ type: "paragraph", level: null, text: "Improved", items: [] }],
            },
          },
        });
        const detail = await threads.getThread("a", post.id, run.threadId);
        assert.equal(detail.thread.type, "inline");
        assert.equal(detail.messages.length, 2);
        const proposal = run.response.proposals[0];
        await assert.rejects(runs.updateProposal("b", run.id, proposal.toolCallId, { status: "applied" }), {
          code: "NOT_FOUND",
        });
        await runs.updateProposal("a", run.id, proposal.toolCallId, { status: "discarded" });
        const updated = await threads.getThread("a", post.id, run.threadId);
        assert.equal(
          updated.messages.find((message) => message.runId === run.id).parts.find((part) => part.type === "proposal")
            .proposal.status,
          "discarded",
        );
        assert.deepEqual(
          (await pool.query("SELECT draft_document FROM blog_posts WHERE id=$1", [post.id])).rows[0].draft_document,
          post.draftDocument,
        );
      },
    );
    await t.test("attachments bind to one originating input and are reusable for its regeneration", async () => {
      const link = await threads.createLinkAttachment("a", post.id, first.id, {
        type: "link",
        url: "https://openai.com/article",
        label: "Reference",
      });
      const file = await threads.uploadAttachment(
        "a",
        post.id,
        first.id,
        new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], "image.png", { type: "image/png" }),
      );
      const input = request({ attachmentIds: [link.id, file.id] });
      const run = await complete(input);
      const detail = await threads.getThread("a", post.id, first.id);
      assert.equal(detail.attachments.find((item) => item.id === link.id).messageId, run.inputMessageId);
      assert.equal(
        detail.messages
          .find((message) => message.id === run.inputMessageId)
          .parts.filter((part) => part.type === "attachment").length,
        2,
      );
      const retry = await complete({ ...input, clientRequestId: randomUUID(), inputMessageId: run.inputMessageId });
      assert.equal(retry.inputMessageId, run.inputMessageId);
      assert.notEqual(retry.assistantMessageId, run.assistantMessageId);
      await assert.rejects(runs.startBlogRun("a", { ...input, clientRequestId: randomUUID() }), /unavailable/i);
      await assert.rejects(threads.removeAttachment("a", post.id, first.id, link.id), /history/i);
    });
    await t.test("new article draft exists before provider work and completion fills that same draft", async () => {
      let release;
      const wait = new Promise((resolve) => {
        release = resolve;
      });
      const input = {
        clientRequestId: randomUUID(),
        operation: "generate",
        message: "An invoice guide",
        references: ["https://openai.com/article"],
      };
      scenarios.push({
        wait,
        result: {
          output: {
            title: "Ignored article title",
            excerpt: "Summary",
            blocks: [{ type: "paragraph", level: null, text: "Useful content", items: [] }],
            seoTitle: "Invoice guide",
            seoDescription: "Guidance",
            keywords: ["invoice"],
          },
        },
      });
      const response = await runs.streamBlogRun("a", input, new AbortController().signal);
      const reader = response.body.getReader();
      const event = JSON.parse(new TextDecoder().decode((await reader.read()).value).trim());
      assert.ok(event.run.postId && event.run.threadId && event.run.inputMessageId && event.run.assistantMessageId);
      const initial = (await pool.query("SELECT * FROM blog_posts WHERE id=$1", [event.run.postId])).rows[0];
      assert.equal(initial.draft_document.title, "Untitled");
      assert.equal(initial.published_revision_id, null);
      release();
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
      }
      const final = await runs.getBlogRun("a", event.run.id);
      assert.equal(final.status, "completed");
      assert.equal(final.postId, event.run.postId);
      const saved = (await pool.query("SELECT draft_document FROM blog_posts WHERE id=$1", [event.run.postId])).rows[0]
        .draft_document;
      assert.equal(saved.body.content[0].content[0].text, "Useful content");
      assert.notEqual(saved.title, "Ignored article title");
      const repeated = await runs.startBlogRun("a", input);
      assert.equal(repeated.run.postId, final.postId);
      assert.equal(repeated.fresh, false);
    });
    await t.test("title failure retains reported usage and article completion supplies a fallback title", async () => {
      const generate = AIClient.prototype.generate;
      const { AIError } = await import("../lib/ai/errors.ts");
      AIClient.prototype.generate = async () => {
        const error = new AIError("CANCELLED", "Title stopped.");
        error.usage = { inputTokens: 2, outputTokens: 1, totalTokens: 3 };
        throw error;
      };
      try {
        const run = await complete(
          { clientRequestId: randomUUID(), operation: "generate", message: "A useful guide" },
          {
            result: {
              output: {
                title: "Article fallback title",
                excerpt: "Summary",
                blocks: [{ type: "paragraph", level: null, text: "Useful content", items: [] }],
                seoTitle: "Guide",
                seoDescription: "Guidance",
                keywords: [],
              },
            },
          },
        );
        assert.equal(
          (await pool.query("SELECT draft_document FROM blog_posts WHERE id=$1", [run.postId])).rows[0].draft_document
            .title,
          "Article fallback title",
        );
        const message = (await threads.getThread("a", run.postId, run.threadId)).messages.find(
          (item) => item.runId === run.id,
        );
        assert.deepEqual(message.meta.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
      } finally {
        AIClient.prototype.generate = generate;
      }
    });
    await t.test("frontend abort after full model receipt still saves the completed result", async () => {
      const controller = new AbortController();
      scenarios.push({ afterReceived: () => controller.abort(), result: { text: "Already received" } });
      const events = await readEvents(await runs.streamBlogRun("a", request(), controller.signal));
      const initial = events.find((event) => event.type === "run");
      assert.ok(controller.signal.aborted);
      assert.equal(
        events.some((event) => event.type === "completed"),
        false,
      );
      const persisted = await runs.getBlogRun("a", initial.run.id);
      assert.equal(persisted.status, "completed");
      assert.equal(persisted.response.text, "Already received");
    });
    await t.test("clearing history during a running request does not block or restore erased messages", async () => {
      const thread = await threads.createThread("a", post.id, {});
      let release;
      const wait = new Promise((resolve) => {
        release = resolve;
      });
      scenarios.push({ wait });
      const response = await runs.streamBlogRun("a", request({ threadId: thread.id }), new AbortController().signal);
      const reader = response.body.getReader();
      await reader.read();
      await reader.read();
      await threads.removeThreadHistory("a", post.id, thread.id);
      release();
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
      }
      const detail = await threads.getThread("a", post.id, thread.id);
      assert.equal(detail.messages.length, 0);
      assert.equal(detail.runs.length, 0);
    });
    await t.test("tool calls remain proposals and their outcome appears in the originating message", async () => {
      const tool = {
        id: "tool-one",
        name: "proposeEdit",
        input: {
          originalText: "Original",
          blocks: [{ type: "paragraph", level: null, text: "Replacement", items: [] }],
        },
      };
      const run = await complete(
        request({
          editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Original" }] }] },
        }),
        { tool, result: { text: "Suggested change" } },
      );
      await runs.updateProposal("a", run.id, tool.id, { status: "applied" });
      const message = (await threads.getThread("a", post.id, first.id)).messages.find((item) => item.runId === run.id);
      assert.ok(message.parts.some((part) => part.type === "tool-call" && part.id === tool.id));
      assert.ok(message.parts.some((part) => part.type === "tool-result" && part.id === tool.id));
      assert.equal(message.parts.find((part) => part.type === "proposal").proposal.status, "applied");
    });
    await t.test(
      "agents save one immutable thread artifact, isolate chat, and enforce private attachment scope",
      async () => {
        const thread = await threads.createThread("a", post.id, {});
        const { AUDIT_CATEGORIES } = await import("../lib/blog/agentRegistry.ts");
        const document = {
          ...post.draftDocument,
          body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Article content" }] }] },
        };
        const output = {
          label: "Editorial audit",
          summary: "Reviewed all eight categories.",
          sections: AUDIT_CATEGORIES.map((heading) => ({
            heading,
            text: "No issue identified; factual claims remain unverified.",
            items: [],
            findings: [],
          })),
          document: null,
          keywords: [],
          searchIntent: "",
          changes: [],
          remainingTasks: [],
        };
        const agentRequest = (extra = {}) => ({
          clientRequestId: randomUUID(),
          operation: "agent",
          agentId: "auditor",
          message: "Audit this article",
          postId: post.id,
          threadId: thread.id,
          document,
          ...extra,
        });
        const originalCapabilities = AIClient.prototype.getCapabilities;
        AIClient.prototype.getCapabilities = function () {
          return { ...originalCapabilities.call(this), webSearch: false };
        };
        try {
          await assert.rejects(runs.startBlogRun("a", agentRequest({ settings: { webSearch: true } })), {
            code: "CAPABILITY",
          });
        } finally {
          AIClient.prototype.getCapabilities = originalCapabilities;
        }
        const source = await threads.createLinkAttachment("a", post.id, thread.id, {
          type: "link",
          url: "https://openai.com/",
        });
        await complete(
          request({ threadId: thread.id, message: "Private ordinary chat context", attachmentIds: [source.id] }),
        );
        const input = agentRequest({ attachmentIds: [source.id] });
        const run = await complete(input, { result: { output } });
        assert.equal(run.inputMessageId, null);
        assert.equal(run.assistantMessageId, null);
        assert.equal(run.response.text, "");
        assert.equal(run.response.artifact.agentId, "auditor");
        assert.equal(JSON.stringify(providerRequests.at(-1).messages).includes("Private ordinary chat context"), false);
        const stored = (await pool.query("SELECT * FROM blog_attachments WHERE run_id=$1", [run.id])).rows;
        assert.equal(stored.length, 1);
        assert.equal(stored[0].type, "artifact");
        assert.equal(stored[0].message_id, null);
        assert.equal(stored[0].data.artifact.content.sections.length, 8);
        assert.equal(
          (await pool.query("SELECT count(*)::int n FROM blog_messages WHERE run_id=$1", [run.id])).rows[0].n,
          0,
        );
        assert.equal(
          JSON.stringify(run.response).includes("No issue identified"),
          false,
          "run response does not duplicate report content",
        );
        const foreignRun = await runs.startBlogRun("a", agentRequest({ threadId: first.id }));
        await assert.rejects(
          pool.query(
            "INSERT INTO blog_attachments(id,thread_id,owner_id,run_id,type,label,data,status,expires_at) VALUES($1,$2,'a',$3,'artifact','Invalid','{}','ready',now()+interval '1 day')",
            [randomUUID(), thread.id, foreignRun.run.id],
          ),
          { code: "23503" },
        );
        await assert.rejects(
          pool.query(
            "INSERT INTO blog_attachments(id,thread_id,owner_id,run_id,type,label,data,status,expires_at) VALUES($1,$2,'a',$3,'artifact','Duplicate','{}','ready',now()+interval '1 day')",
            [randomUUID(), thread.id, run.id],
          ),
          { code: "23505" },
        );
        const detail = await threads.getThread("a", post.id, thread.id);
        assert.equal(
          detail.runs.some((item) => item.id === run.id),
          false,
        );
        assert.equal(detail.executions[0].artifact.attachmentId, stored[0].id);
        assert.equal(detail.executions[0].requestMessage, "Audit this article");
        const expiredExecution = threads.executionView({
          ...run,
          createdAt: new Date(run.createdAt),
          updatedAt: new Date(run.updatedAt),
          completedAt: new Date(run.completedAt),
          expiresAt: new Date(0),
          continuation: {},
        });
        assert.equal(expiredExecution.requestMessage, undefined);
        const clearedExecution = threads.executionView({
          ...run,
          createdAt: new Date(run.createdAt),
          updatedAt: new Date(run.updatedAt),
          completedAt: new Date(run.completedAt),
          expiresAt: new Date(Date.now() + 60000),
          continuation: { cleared: true },
        });
        assert.equal(clearedExecution.requestMessage, undefined);
        assert.equal(detail.messages.length, 2);
        const library = await threads.listThreadAttachments("a", post.id, thread.id, "artifacts");
        assert.equal(library.attachments[0].data.artifact, undefined);
        assert.equal(library.attachments[0].data.artifactSummary.agentId, "auditor");
        assert.equal((await threads.listThreadAttachments("a", post.id, thread.id, "sources")).attachments.length, 1);
        assert.equal(
          (await threads.getThreadAttachment("a", post.id, thread.id, stored[0].id)).attachment.data.artifact.content
            .sections.length,
          8,
        );
        await assert.rejects(threads.getThreadAttachment("b", post.id, thread.id, stored[0].id), { code: "NOT_FOUND" });
        await assert.rejects(threads.getThreadAttachment("a", post.id, first.id, stored[0].id), { code: "NOT_FOUND" });
        const before = submissions;
        await readEvents(await runs.streamBlogRun("a", input, new AbortController().signal));
        assert.equal(submissions, before);
        assert.equal(
          (await pool.query("SELECT count(*)::int n FROM blog_attachments WHERE run_id=$1", [run.id])).rows[0].n,
          1,
        );
        const richDraft = {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Please ", marks: [{ type: "bold" }] },
                { type: "agentMention", attrs: { agentId: "optimizer" } },
                { type: "text", text: "improve this" },
              ],
            },
          ],
        };
        await threads.updateThread("a", post.id, thread.id, {
          composerDraft: "Please improve this",
          composerState: { agentId: "optimizer", agentOffset: 7, content: richDraft, attachmentIds: [stored[0].id] },
        });
        const restored = await threads.getThread("a", post.id, thread.id);
        assert.equal(restored.thread.composerState.agentOffset, 7);
        assert.deepEqual(restored.thread.composerState.content, richDraft);
        assert.equal(
          restored.attachments.find((item) => item.id === stored[0].id).data.artifactSummary.agentId,
          "auditor",
        );
        assert.equal(restored.attachments.find((item) => item.id === stored[0].id).data.artifact, undefined);
        await complete(request({ threadId: thread.id, attachmentIds: [stored[0].id] }));
        assert.ok(JSON.stringify(providerRequests.at(-1).messages).includes("Reviewed all eight categories"));
        assert.equal(
          (await pool.query("SELECT message_id FROM blog_attachments WHERE id=$1", [stored[0].id])).rows[0].message_id,
          null,
        );
        const expiry = stored[0].expires_at;
        await complete(agentRequest({ attachmentIds: [stored[0].id] }), { result: { output } });
        assert.equal(
          (
            await pool.query("SELECT expires_at FROM blog_attachments WHERE id=$1", [stored[0].id])
          ).rows[0].expires_at.toISOString(),
          expiry.toISOString(),
        );
        await assert.rejects(
          runs.startBlogRun("a", agentRequest({ threadId: first.id, attachmentIds: [stored[0].id] })),
          { code: "VALIDATION" },
        );
        scenarios.push({ result: { output: { ...output, sections: [] } } });
        const invalidEvents = await readEvents(
          await runs.streamBlogRun("a", agentRequest(), new AbortController().signal),
        );
        const invalidId = invalidEvents.find((event) => event.type === "run").run.id;
        assert.equal(invalidEvents.at(-1).type, "error");
        assert.equal(
          (await pool.query("SELECT count(*)::int n FROM blog_attachments WHERE run_id=$1", [invalidId])).rows[0].n,
          0,
        );
        assert.ok(
          (await threads.getThreadExecutions("a", post.id, thread.id)).executions.some(
            (item) => item.id === invalidId && item.status === "failed",
          ),
        );
        const cancel = new AbortController();
        let releaseCancelled, startedCancelled;
        const cancelledWait = new Promise((resolve) => {
          releaseCancelled = resolve;
        });
        const cancelledStarted = new Promise((resolve) => {
          startedCancelled = resolve;
        });
        scenarios.push({ wait: cancelledWait, started: startedCancelled, result: { output } });
        const cancelledResponse = await runs.streamBlogRun("a", agentRequest(), cancel.signal);
        const cancelledEvents = cancelledResponse.text();
        await cancelledStarted;
        cancel.abort();
        releaseCancelled();
        const cancelledId = JSON.parse((await cancelledEvents).trim().split("\n")[0]).run.id;
        assert.equal((await runs.getBlogRun("a", cancelledId)).status, "cancelled");
        assert.equal(
          (await pool.query("SELECT count(*)::int n FROM blog_attachments WHERE run_id=$1", [cancelledId])).rows[0].n,
          0,
        );
        const draftBefore = (await pool.query("SELECT draft_document FROM blog_posts WHERE id=$1", [post.id])).rows[0]
          .draft_document;
        const proposed = {
          ...output,
          label: "New draft",
          sections: [],
          document: {
            title: "A better article",
            excerpt: "A complete revised draft",
            bodyJson: JSON.stringify(document.body),
            seoTitle: "Article guide",
            seoDescription: "A practical article guide",
          },
          changes: ["Improved title"],
        };
        const writer = await complete(agentRequest({ agentId: "writer" }), { result: { output: proposed } });
        const writerDetail = await threads.getThreadAttachment(
          "a",
          post.id,
          thread.id,
          writer.response.artifact.attachmentId,
        );
        assert.match(writerDetail.html, /Article content/);
        assert.equal(writerDetail.attachment.data.artifact.content.document.title, "A better article");
        assert.deepEqual(
          (await pool.query("SELECT draft_document FROM blog_posts WHERE id=$1", [post.id])).rows[0].draft_document,
          draftBefore,
          "agent preview never saves the draft",
        );
        await assert.rejects(threads.removeAttachment("a", post.id, thread.id, writer.response.artifact.attachmentId), {
          code: "CONFLICT",
        });
        const legacy = await complete(request({ threadId: thread.id, message: "Legacy review instruction" }), {
          result: { text: "Legacy analysis report" },
        });
        await pool.query("UPDATE blog_runs SET operation='review' WHERE id=$1", [legacy.id]);
        const legacyFiltered = await threads.getThread("a", post.id, thread.id);
        assert.equal(
          legacyFiltered.messages.some(
            (message) => message.id === legacy.inputMessageId || message.runId === legacy.id,
          ),
          false,
        );
        assert.ok(legacyFiltered.executions.some((item) => item.id === legacy.id));
        assert.equal((await runs.getBlogRun("a", legacy.id)).response.text, "Legacy analysis report");
        await complete(request({ threadId: thread.id, message: "New ordinary chat" }));
        assert.equal(JSON.stringify(providerRequests.at(-1).messages).includes("Legacy review instruction"), false);
        assert.equal(JSON.stringify(providerRequests.at(-1).messages).includes("Legacy analysis report"), false);
        for (let i = 0; i < 26; i++) await runs.startBlogRun("a", agentRequest({ message: `Queued agent ${i}` }));
        const firstPage = await threads.getThreadExecutions("a", post.id, thread.id);
        assert.equal(firstPage.executions.length, 25);
        assert.ok(firstPage.nextCursor);
        const secondPage = await threads.getThreadExecutions("a", post.id, thread.id, firstPage.nextCursor);
        assert.ok(secondPage.executions.length > 0);
        assert.equal(
          new Set([...firstPage.executions, ...secondPage.executions].map((item) => item.id)).size,
          firstPage.executions.length + secondPage.executions.length,
        );
        await assert.rejects(threads.getThreadExecutions("a", post.id, first.id, firstPage.nextCursor), {
          code: "VALIDATION",
        });
        for (let i = 0; i < 26; i++)
          await threads.createLinkAttachment("a", post.id, thread.id, {
            type: "link",
            url: `https://openai.com/page-${i}`,
          });
        const firstSources = await threads.listThreadAttachments("a", post.id, thread.id, "sources");
        const secondSources = await threads.listThreadAttachments(
          "a",
          post.id,
          thread.id,
          "sources",
          firstSources.nextCursor,
        );
        assert.equal(firstSources.attachments.length, 25);
        assert.equal(secondSources.attachments.length, 2);
        let release, started;
        const wait = new Promise((resolve) => {
          release = resolve;
        });
        const entered = new Promise((resolve) => {
          started = resolve;
        });
        scenarios.push({ wait, started, result: { output } });
        const pending = await runs.streamBlogRun("a", agentRequest(), new AbortController().signal);
        const pendingBody = pending.text();
        await entered;
        await threads.removeThreadHistory("a", post.id, thread.id);
        assert.equal(
          (
            await pool.query("SELECT count(*)::int n FROM blog_attachments WHERE thread_id=$1 AND type='artifact'", [
              thread.id,
            ])
          ).rows[0].n,
          0,
        );
        release();
        await pendingBody;
        assert.equal(
          (
            await pool.query("SELECT count(*)::int n FROM blog_attachments WHERE thread_id=$1 AND type='artifact'", [
              thread.id,
            ])
          ).rows[0].n,
          0,
          "late completion cannot resurrect cleared output",
        );
        const afterClear = await complete(agentRequest(), { result: { output } });
        await pool.query("UPDATE blog_attachments SET expires_at=now()-interval '1 day' WHERE run_id=$1", [
          afterClear.id,
        ]);
        await pool.query("UPDATE blog_runs SET expires_at=now()-interval '1 day' WHERE id=$1", [afterClear.id]);
        await assert.rejects(
          threads.getThreadAttachment("a", post.id, thread.id, afterClear.response.artifact.attachmentId),
          { code: "NOT_FOUND" },
        );
        const { cleanupBlogAssistant } = await import("../lib/blog/assistantMaintenance.ts");
        await cleanupBlogAssistant();
        assert.equal(
          (await pool.query("SELECT count(*)::int n FROM blog_attachments WHERE run_id=$1", [afterClear.id])).rows[0].n,
          0,
        );
        assert.equal(
          (await pool.query("SELECT response FROM blog_runs WHERE id=$1", [afterClear.id])).rows[0].response,
          null,
        );
      },
    );
    await t.test("ordinary expiry erases private content while preserving execution usage once", async () => {
      const thread = await threads.createThread("a", post.id, {});
      const run = await complete(request({ threadId: thread.id }));
      await pool.query("UPDATE blog_runs SET expires_at=now()-interval '1 day' WHERE id=$1", [run.id]);
      const { cleanupBlogAssistant } = await import("../lib/blog/assistantMaintenance.ts");
      await cleanupBlogAssistant();
      const stored = (await pool.query("SELECT * FROM blog_runs WHERE id=$1", [run.id])).rows[0];
      assert.ok(stored);
      assert.equal(stored.response, null);
      assert.equal(stored.request.message, "Expired content");
      assert.deepEqual(stored.usage, { inputTokens: 8, outputTokens: 4, totalTokens: 12 });
      assert.equal(stored.continuation.contentExpired, true);
      const history = (await pool.query("SELECT * FROM blog_messages WHERE thread_id=$1", [thread.id])).rows;
      assert.ok(history.every((message) => message.parts.length === 0));
      assert.equal(history.find((message) => message.role === "assistant").meta.usage.totalTokens, 12);
      assert.equal((await cleanupBlogAssistant()).runs, 0);
    });
  },
);
