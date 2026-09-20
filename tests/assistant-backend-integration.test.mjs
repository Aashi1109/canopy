import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import pg from "pg";

// Explicit disposable database only. Never use the application's configured URL.
const url = process.env.ASSISTANT_TEST_DATABASE_URL;

test(
  "generic Assistant services persist isolated feature conversations without Blog resources",
  {
    skip: url ? false : "set ASSISTANT_TEST_DATABASE_URL to a disposable PostgreSQL database",
  },
  async (t) => {
    const schema = `assistant_backend_${randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    const target = new URL(url);
    target.searchParams.set("options", `-c search_path=${schema}`);
    const previous = Object.fromEntries(
      ["DATABASE_URL", "AI_ENABLED", "AI_PROVIDER", "OPENAI_API_KEY"].map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      DATABASE_URL: target.toString(),
      AI_ENABLED: "true",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "fixture-only",
    });
    const pool = new pg.Pool({ connectionString: target.toString(), max: 5 });
    const http = { actor: "owner", services: new Map() };
    globalThis.__assistantBackendHttpTest = http;
    const hooks = registerHooks({
      resolve(specifier, context, next) {
        if (specifier === "server-only") return { shortCircuit: true, url: "data:text/javascript,export {};" };
        if (specifier.startsWith("@/")) return next(new URL("../" + specifier.slice(2), import.meta.url).href, context);
        return next(specifier, context);
      },
      load(url, context, next) {
        if (url === new URL("../lib/auth/session.ts", import.meta.url).href)
          return {
            shortCircuit: true,
            format: "module",
            source: `
            export class AuthServiceError extends Error {}
            export async function getSession() {
              const actor = globalThis.__assistantBackendHttpTest.actor;
              return actor ? { user: { id: actor, status: 'active' } } : null;
            }
          `,
          };
        if (url === new URL("../app/api/assistant/integrations.ts", import.meta.url).href)
          return {
            shortCircuit: true,
            format: "module",
            source: `
            export function getAssistantService(key) {
              const service = globalThis.__assistantBackendHttpTest.services.get(key);
              if (!service) throw new Error('Unknown test integration');
              return service;
            }
          `,
          };
        return next(url, context);
      },
    });
    let sqlClient;
    let AIClient;
    let original;
    t.after(async () => {
      if (sqlClient) await sqlClient.end();
      await pool.end();
      if (AIClient && original) Object.assign(AIClient.prototype, original);
      hooks.deregister();
      delete globalThis.__assistantBackendHttpTest;
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    });
    for (const file of [
      "0001-baseline/0001_auth_control_plane.sql",
      "0007-generic-assistant/0001_generic_assistant.sql",
    ])
      await pool.query(await readFile(new URL(`../db/migration/${file}`, import.meta.url), "utf8"));
    await pool.query(
      "INSERT INTO auth_users(id,name,email) VALUES ('owner','Owner','owner@test.invalid'),('other','Other','other@test.invalid')",
    );
    await pool.query(
      `CREATE TABLE fixture_resources(id text NOT NULL,integration_key text NOT NULL,owner_id text NOT NULL,PRIMARY KEY(id,integration_key)); CREATE TABLE fixture_completions(run_id text PRIMARY KEY,integration_key text NOT NULL)`,
    );
    ({ AIClient } = await import("../lib/ai/client.ts"));
    ({ sqlClient } = await import("../db/index.ts"));
    const { createAssistantService } = await import("../lib/assistant/service.ts");
    const { AssistantError } = await import("../lib/assistant/validation.ts");
    const { sql } = await import("../db/index.ts");
    original = Object.fromEntries(
      ["getCapabilities", "stream", "generate", "uploadFile", "deleteFile", "deleteResponse"].map((key) => [
        key,
        AIClient.prototype[key],
      ]),
    );
    const scenarios = [];
    const providerRequests = [];
    const deletedResponses = [];
    AIClient.prototype.getCapabilities = () => ({
      provider: "openai",
      model: "fixture-model",
      configured: true,
      images: true,
      structuredOutput: true,
      webSearch: true,
      urlRetrieval: true,
      tools: true,
    });
    AIClient.prototype.stream = async function* (request) {
      providerRequests.push(request);
      const scenario = scenarios.shift() ?? {};
      const result = {
        id: randomUUID(),
        provider: "openai",
        model: "fixture-model",
        status: "completed",
        text: "Fixture answer",
        output: null,
        citations: [],
        toolCalls: [],
        metadata: {},
        usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
        ...scenario.result,
      };
      yield {
        type: "response",
        response: { id: result.id, provider: result.provider, model: result.model, status: "running" },
      };
      scenario.started?.();
      yield { type: "text-delta", text: result.text };
      if (scenario.wait) await scenario.wait;
      if (scenario.fail) throw scenario.fail;
      yield { type: "completed", result };
    };
    AIClient.prototype.generate = async () => {
      throw new Error("Unexpected generation outside fake stream");
    };
    AIClient.prototype.uploadFile = async () => {
      throw new Error("Unexpected file upload");
    };
    AIClient.prototype.deleteFile = async () => {};
    AIClient.prototype.deleteResponse = async (id) => {
      deletedResponses.push(id);
    };

    const revoked = new Set();
    const reservations = [];
    function integration(key) {
      return {
        key,
        defaultSettings: { tone: "plain" },
        validateSettings(value) {
          if (!value || typeof value !== "object" || Object.keys(value).some((name) => name !== "tone"))
            throw new AssistantError("VALIDATION", "Unknown fixture setting");
          return value;
        },
        validateRequest(request) {
          if (
            !["chat", "isolated-chat", "aux-failure", "report", "create", "proposal"].includes(request.operation) ||
            !request.message
          )
            throw new AssistantError("VALIDATION", "Unknown fixture operation");
          return request;
        },
        operation(request) {
          return {
            executionMode: request.operation === "report" ? "standalone" : "conversational",
            threadType: "chat",
            includeHistory: !["report", "isolated-chat"].includes(request.operation),
            structuredOutput: request.operation === "report",
          };
        },
        operationLabel(operation) {
          return `Fixture ${operation}`;
        },
        async authorize(tx, actor, resourceId) {
          if (!["owner", "other"].includes(actor) || revoked.has(key))
            throw new AssistantError("FORBIDDEN", "Access revoked", 403);
          if (resourceId) {
            const result = await tx.execute(
              sql`SELECT id FROM fixture_resources WHERE id=${resourceId} AND integration_key=${key} AND owner_id=${actor}`,
            );
            if (!result.rows.length) throw new AssistantError("NOT_FOUND", "Fixture resource unavailable", 404);
          }
        },
        async authorizeConfiguration(actor) {
          if (actor !== "owner") throw new AssistantError("FORBIDDEN", "No configuration access", 403);
        },
        async reserveResource(tx, actor, request) {
          if (request.operation !== "create") return undefined;
          const id = randomUUID();
          reservations.push({ key, id });
          await tx.execute(
            sql`INSERT INTO fixture_resources(id,integration_key,owner_id) VALUES (${id},${key},${actor})`,
          );
          return id;
        },
        retryRequest(originalRequest, incoming) {
          return {
            ...originalRequest,
            clientRequestId: incoming.clientRequestId,
            inputMessageId: incoming.inputMessageId,
          };
        },
        isArtifact(value) {
          return (
            !!value &&
            value.schemaVersion === 1 &&
            value.agentVersion === 1 &&
            value.agentId === "fixture-report" &&
            typeof value.summary === "string"
          );
        },
        artifactDetail(value) {
          return { html: `<p>${value.summary}</p>` };
        },
        buildRequest({ run, history, attachments, signal }) {
          return {
            messages: [
              ...history.map((message) => ({
                role: message.role,
                content: message.parts
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("\n"),
              })),
              { role: "user", content: run.request.message },
              ...attachments
                .filter((attachment) => attachment.type === "artifact")
                .map((attachment) => ({ role: "user", content: JSON.stringify(attachment.data.artifact) })),
            ],
            signal,
          };
        },
        validateResult(result, request) {
          const response = {
            text: result.text,
            citations: [],
            proposals:
              request.operation === "proposal"
                ? [{ id: "change", status: "pending", data: { value: "proposed" } }]
                : [],
          };
          return request.operation === "report"
            ? {
                response,
                artifact: {
                  label: "Fixture report",
                  value: {
                    schemaVersion: 1,
                    agentVersion: 1,
                    agentId: "fixture-report",
                    summary: result.text,
                    content: { result: result.text },
                  },
                },
              }
            : { response };
        },
        async complete(tx, run) {
          await tx.execute(sql`INSERT INTO fixture_completions(run_id,integration_key) VALUES (${run.id},${key})`);
        },
        async auxiliary(run) {
          if (run.operation === "aux-failure") throw new Error("Optional title generation failed");
          return undefined;
        },
        audit: {
          prefix: `assistant.${key}`,
          resourcePrefix: "assistant",
          resourceMetadata: (resourceId) => ({ resourceId }),
        },
      };
    }
    const alpha = createAssistantService(integration("fixture-alpha"));
    const beta = createAssistantService(integration("fixture-beta"));
    http.services.set("fixture-alpha", alpha);
    http.services.set("fixture-beta", beta);
    const request = (extra = {}) => ({
      clientRequestId: randomUUID(),
      operation: "chat",
      message: "Question",
      ...extra,
    });
    const eventsOf = async (response) => (await response.text()).trim().split("\n").filter(Boolean).map(JSON.parse);
    async function complete(service, input, scenario = {}, actor = "owner") {
      scenarios.push(scenario);
      const events = await eventsOf(await service.streamRun(actor, input, new AbortController().signal));
      const completed = events.find((event) => event.type === "completed");
      assert.ok(completed, JSON.stringify(events));
      return completed.run;
    }

    await t.test("non-Blog HTTP workflow uses real shared services and persistence without a resource", async () => {
      const root = new URL("../app/api/assistant/[integrationKey]/", import.meta.url);
      const runRoutes = await import(new URL("runs/route.ts", root));
      const runRoute = await import(new URL("runs/[runId]/route.ts", root));
      const threadRoute = await import(new URL("threads/[threadId]/route.ts", root));
      const threadRoutes = await import(new URL("threads/route.ts", root));
      const libraryRoute = await import(new URL("threads/[threadId]/attachments/route.ts", root));
      const artifactRoute = await import(new URL("threads/[threadId]/attachments/[attachmentId]/route.ts", root));
      const endpoint = (path, method = "GET", input) =>
        new Request(`https://assistant.test/api/assistant/fixture-alpha/${path}`, {
          method,
          headers: { origin: "https://assistant.test", "content-type": "application/json" },
          ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        });
      const context = (values = {}) => ({ params: Promise.resolve({ integrationKey: "fixture-alpha", ...values }) });
      scenarios.push({ result: { text: "A report created through HTTP" } });
      const response = await runRoutes.POST(endpoint("runs", "POST", request({ operation: "report" })), context());
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("content-type"), "application/x-ndjson");
      const events = await eventsOf(response);
      const run = events.find((event) => event.type === "completed")?.run;
      assert.ok(run, JSON.stringify(events));
      assert.equal(run.integrationKey, "fixture-alpha");
      assert.equal(run.resourceId, null);
      const runResponse = await runRoute.GET(endpoint(`runs/${run.id}`), context({ runId: run.id }));
      assert.equal(runResponse.status, 200);
      assert.equal((await runResponse.json()).run.response.text, "A report created through HTTP");
      const threadResponse = await threadRoute.GET(
        endpoint(`threads/${run.threadId}`),
        context({ threadId: run.threadId }),
      );
      const detail = await threadResponse.json();
      assert.equal(threadResponse.status, 200);
      assert.deepEqual(detail.thread.settings, { tone: "plain" }, "auto-created threads persist integration defaults");
      assert.equal(detail.thread.resourceId, null);
      assert.equal(detail.executions[0].id, run.id);
      const threadList = await threadRoutes.GET(endpoint("threads"), context());
      assert.ok((await threadList.json()).threads.some((thread) => thread.id === run.threadId));
      const library = await libraryRoute.GET(
        endpoint(`threads/${run.threadId}/attachments?kind=artifacts`),
        context({ threadId: run.threadId }),
      );
      assert.equal(library.status, 200);
      const attachmentId = run.response.artifact.attachmentId;
      assert.ok((await library.json()).attachments.some((attachment) => attachment.id === attachmentId));
      const artifact = await artifactRoute.GET(
        endpoint(`threads/${run.threadId}/attachments/${attachmentId}`),
        context({ threadId: run.threadId, attachmentId }),
      );
      assert.equal((await artifact.json()).attachment.data.artifact.summary, "A report created through HTTP");
      assert.equal(
        (await pool.query("SELECT integration_key,resource_id FROM assistant_runs WHERE id=$1", [run.id])).rows[0]
          .resource_id,
        null,
      );
      const foreignIntegration = await runRoute.GET(
        endpoint(`runs/${run.id}`),
        context({ integrationKey: "fixture-beta", runId: run.id }),
      );
      assert.equal(foreignIntegration.status, 404);
      try {
        http.actor = "other";
        assert.equal(
          (await threadRoute.GET(endpoint(`threads/${run.threadId}`), context({ threadId: run.threadId }))).status,
          404,
        );
        http.actor = null;
        assert.equal((await runRoute.GET(endpoint(`runs/${run.id}`), context({ runId: run.id }))).status, 401);
      } finally {
        http.actor = "owner";
      }
      const deleted = await threadRoute.DELETE(
        endpoint(`threads/${run.threadId}`, "DELETE"),
        context({ threadId: run.threadId }),
      );
      assert.equal(deleted.status, 200);
      assert.deepEqual(await deleted.json(), { ok: true });
      assert.equal(
        (await threadRoute.GET(endpoint(`threads/${run.threadId}`), context({ threadId: run.threadId }))).status,
        404,
      );
      assert.equal((await pool.query("SELECT to_regclass('blog_posts') AS table_name")).rows[0].table_name, null);
    });

    await t.test(
      "no-resource threads support settings and composer persistence with owner/integration isolation",
      async () => {
        const a = await alpha.createThread("owner", null, { title: "A" });
        const b = await beta.createThread("owner", null, { title: "B" });
        const other = await alpha.createThread("other", null, { title: "Private" });
        await alpha.updateThread("owner", null, a.id, {
          title: "Renamed",
          settings: { tone: "short" },
          composerDraft: "Unsent work",
          composerState: { attachmentIds: [] },
        });
        const detail = await alpha.getThread("owner", null, a.id);
        assert.equal(detail.thread.title, "Renamed");
        assert.equal(detail.thread.composerDraft, "Unsent work");
        assert.deepEqual(detail.thread.settings, { tone: "short" });
        assert.deepEqual(
          (await alpha.listThreads("owner", null)).map((thread) => thread.id),
          [a.id],
        );
        assert.deepEqual(
          (await beta.listThreads("owner", null)).map((thread) => thread.id),
          [b.id],
        );
        await assert.rejects(beta.getThread("owner", null, a.id), { code: "NOT_FOUND" });
        await assert.rejects(alpha.getThread("owner", null, other.id), { code: "NOT_FOUND" });
        assert.equal((await alpha.config("owner")).enabled, true);
        await assert.rejects(alpha.config("other"), { code: "FORBIDDEN" });
      },
    );

    await t.test(
      "same resource and request IDs are isolated across integrations and retries stay in their thread",
      async () => {
        await pool.query(
          "INSERT INTO fixture_resources VALUES ('same-resource','fixture-alpha','owner'),('same-resource','fixture-beta','owner')",
        );
        const a = await alpha.createThread("owner", "same-resource", {});
        const b = await beta.createThread("owner", "same-resource", {});
        const input = request({ clientRequestId: "same-id", resourceId: "same-resource", threadId: a.id });
        const one = await complete(alpha, input);
        const two = await complete(beta, { ...input, threadId: b.id });
        assert.notEqual(one.id, two.id);
        await assert.rejects(beta.getRun("owner", one.id), { code: "NOT_FOUND" });
        await assert.rejects(alpha.getRun("other", one.id), { code: "NOT_FOUND" });
        await assert.rejects(beta.startRun("owner", request({ threadId: b.id, inputMessageId: one.inputMessageId })), {
          code: "NOT_FOUND",
        });
        await assert.rejects(alpha.getThread("owner", null, a.id), { code: "NOT_FOUND" });
        assert.ok(!(await alpha.listThreads("owner", null)).some((thread) => thread.id === a.id));
        const retry = await complete(
          alpha,
          request({ threadId: a.id, inputMessageId: one.inputMessageId, message: "Must retain original" }),
        );
        assert.equal(retry.inputMessageId, one.inputMessageId);
        assert.equal(retry.request.message, input.message);
        assert.equal(
          (await alpha.getThread("owner", undefined, a.id)).messages.filter((message) => message.role === "user")
            .length,
          1,
        );
      },
    );

    await t.test("idempotency precedes resource reservation and replay never creates a second resource", async () => {
      const input = request({ operation: "create", clientRequestId: "create-once" });
      const [one, two] = await Promise.all([alpha.startRun("owner", input), alpha.startRun("owner", input)]);
      assert.equal(one.run.id, two.run.id);
      assert.equal(Number(one.fresh) + Number(two.fresh), 1);
      assert.equal(reservations.length, 1);
      await assert.rejects(alpha.startRun("owner", { ...input, message: "Different" }), { code: "CONFLICT" });
      assert.equal(reservations.length, 1);
      const b = await beta.startRun("owner", input);
      assert.notEqual(b.run.resourceId, one.run.resourceId);
      assert.equal(reservations.length, 2);
    });

    await t.test(
      "standalone artifacts are atomic, versioned, and enter future history only by attachment",
      async () => {
        const thread = await alpha.createThread("owner", null, {});
        await complete(alpha, request({ threadId: thread.id, message: "Private chat context" }), {
          result: { text: "Chat answer" },
        });
        const report = await complete(
          alpha,
          request({
            threadId: thread.id,
            operation: "report",
            agentId: "fixture-report",
            message: "Private report instruction",
          }),
          { result: { text: "Standalone secret report" } },
        );
        assert.equal(report.executionMode, "standalone");
        assert.equal(report.inputMessageId, null);
        assert.equal(report.assistantMessageId, null);
        assert.equal(JSON.stringify(providerRequests.at(-1).messages).includes("Private chat context"), false);
        const artifactId = report.response.artifact.attachmentId;
        const stored = (await pool.query("SELECT * FROM assistant_attachments WHERE run_id=$1", [report.id])).rows;
        assert.equal(stored.length, 1);
        assert.equal(stored[0].message_id, null);
        assert.equal(
          (await pool.query("SELECT count(*)::int n FROM fixture_completions WHERE run_id=$1", [report.id])).rows[0].n,
          1,
        );
        const library = await alpha.listThreadAttachments("owner", null, thread.id, "artifacts");
        assert.equal(library.attachments[0].data.artifactSummary.summary, "Standalone secret report");
        assert.equal(library.attachments[0].data.artifact, undefined);
        assert.equal(
          (await alpha.getThreadAttachment("owner", null, thread.id, artifactId)).attachment.data.artifact
            .schemaVersion,
          1,
        );
        await complete(alpha, request({ threadId: thread.id, message: "Next chat" }));
        assert.equal(JSON.stringify(providerRequests.at(-1).messages).includes("Standalone secret report"), false);
        assert.equal(JSON.stringify(providerRequests.at(-1).messages).includes("Private report instruction"), false);
        await complete(
          alpha,
          request({ threadId: thread.id, message: "Use explicit report", attachmentIds: [artifactId] }),
        );
        assert.ok(JSON.stringify(providerRequests.at(-1).messages).includes("Standalone secret report"));
        assert.equal(
          (await pool.query("SELECT message_id FROM assistant_attachments WHERE id=$1", [artifactId])).rows[0]
            .message_id,
          null,
        );
        await assert.rejects(alpha.removeAttachment("owner", null, thread.id, artifactId), { code: "CONFLICT" });
        await pool.query(
          "UPDATE assistant_attachments SET data=jsonb_set(data,'{artifact,agentVersion}','99') WHERE id=$1",
          [artifactId],
        );
        const unsupported = await alpha.getThreadAttachment("owner", null, thread.id, artifactId);
        assert.equal(unsupported.attachment.data.artifact, undefined);
        await assert.rejects(alpha.startRun("owner", request({ threadId: thread.id, attachmentIds: [artifactId] })), {
          code: "VALIDATION",
        });
        const detail = await alpha.getThread("owner", null, thread.id);
        assert.equal(detail.executions.length, 1);
        assert.equal(JSON.stringify(detail.messages).includes("Private report instruction"), false);
      },
    );

    await t.test("plain conversational output streams even when an integration excludes history", async () => {
      const thread = await alpha.createThread("owner", null, {});
      await complete(alpha, request({ threadId: thread.id, message: "Excluded prior context" }));
      scenarios.push({ result: { text: "A visible streaming response" } });
      const events = await eventsOf(
        await alpha.streamRun(
          "owner",
          request({ threadId: thread.id, operation: "isolated-chat" }),
          new AbortController().signal,
        ),
      );
      assert.ok(events.some((event) => event.type === "text-delta" && event.text === "A visible streaming response"));
      assert.ok(events.some((event) => event.type === "completed"));
      assert.equal(JSON.stringify(providerRequests.at(-1).messages).includes("Excluded prior context"), false);
    });

    await t.test("an optional auxiliary rejection does not interrupt primary completion or lose usage", async () => {
      const run = await complete(alpha, request({ operation: "aux-failure" }));
      assert.equal(run.status, "completed");
      assert.equal(run.response.text, "Fixture answer");
      const stored = (await pool.query("SELECT usage FROM assistant_runs WHERE id=$1", [run.id])).rows[0];
      assert.deepEqual(stored.usage, { inputTokens: 2, outputTokens: 3, totalTokens: 5 });
      const detail = await alpha.getThread("owner", null, run.threadId);
      assert.ok(
        detail.messages.some(
          (message) =>
            message.role === "assistant" &&
            message.parts.some((part) => part.type === "text" && part.text === "Fixture answer"),
        ),
      );
    });

    await t.test("proposal outcomes are recorded once and update the saved conversation", async () => {
      const run = await complete(alpha, request({ operation: "proposal" }));
      const applied = await alpha.updateProposal("owner", run.id, "change", { status: "applied" });
      assert.equal(applied.response.proposals[0].status, "applied");
      await alpha.updateProposal("owner", run.id, "change", { status: "applied" });
      await assert.rejects(alpha.updateProposal("owner", run.id, "change", { status: "discarded" }), {
        code: "CONFLICT",
      });
      const detail = await alpha.getThread("owner", null, run.threadId);
      assert.ok(
        detail.messages
          .flatMap((message) => message.parts)
          .some((part) => part.type === "proposal" && part.proposal.status === "applied"),
      );
    });

    await t.test("clear and delete while provider work is pending cannot recreate private artifacts", async () => {
      for (const removeThread of [false, true]) {
        const thread = await alpha.createThread("owner", null, {});
        let release;
        let started;
        const wait = new Promise((resolve) => {
          release = resolve;
        });
        const providerStarted = new Promise((resolve) => {
          started = resolve;
        });
        scenarios.push({ wait, started, result: { text: "Must not survive clear" } });
        const response = await alpha.streamRun(
          "owner",
          request({ threadId: thread.id, operation: "report" }),
          new AbortController().signal,
        );
        const read = eventsOf(response);
        await providerStarted;
        try {
          await alpha.removeThreadHistory("owner", null, thread.id, removeThread);
        } finally {
          release();
        }
        const events = await read;
        assert.ok(!events.some((event) => event.type === "completed"));
        assert.equal(
          (await pool.query("SELECT count(*)::int n FROM assistant_attachments WHERE thread_id=$1", [thread.id]))
            .rows[0].n,
          0,
        );
        assert.equal(
          (await pool.query("SELECT count(*)::int n FROM assistant_messages WHERE thread_id=$1", [thread.id])).rows[0]
            .n,
          0,
        );
        if (removeThread) await assert.rejects(alpha.getThread("owner", null, thread.id), { code: "NOT_FOUND" });
        else assert.deepEqual((await alpha.getThread("owner", null, thread.id)).messages, []);
      }
    });

    await t.test("completion rechecks integration permissions and rolls back artifacts on revocation", async () => {
      let release;
      let started;
      const wait = new Promise((resolve) => {
        release = resolve;
      });
      const providerStarted = new Promise((resolve) => {
        started = resolve;
      });
      scenarios.push({ wait, started });
      const response = await beta.streamRun("owner", request({ operation: "report" }), new AbortController().signal);
      const read = eventsOf(response);
      await providerStarted;
      revoked.add("fixture-beta");
      release();
      const events = await read;
      revoked.delete("fixture-beta");
      const id = events.find((event) => event.type === "run").run.id;
      assert.ok(!events.some((event) => event.type === "completed"));
      assert.equal((await beta.getRun("owner", id)).status, "failed");
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM assistant_attachments WHERE run_id=$1", [id])).rows[0].n,
        0,
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM fixture_completions WHERE run_id=$1", [id])).rows[0].n,
        0,
      );
    });
    assert.equal((await pool.query("SELECT to_regclass('blog_posts') AS table_name")).rows[0].table_name, null);
    assert.ok(deletedResponses.length > 0);
  },
);
