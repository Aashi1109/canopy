import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const root = new URL("../", import.meta.url);
const state = { actor: "owner", status: "active", calls: [] };
globalThis.__assistantRouteTest = state;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) return { shortCircuit: true, url: new URL(specifier.slice(2), root).href };
    return next(specifier, context);
  },
  load(url, context, next) {
    let source;
    if (url === new URL("lib/auth/session.ts", root).href)
      source = `
      export class AuthServiceError extends Error {}
      export async function getSession() {
        const state = globalThis.__assistantRouteTest;
        return state.actor ? { user: { id: state.actor, status: state.status } } : null;
      }
    `;
    if (url === new URL("lib/admin/index.ts", root).href) source = `export class AuthorizationError extends Error {}`;
    if (url === new URL("app/api/assistant/integrations.ts", root).href)
      source = `
      export function getAssistantService(integrationKey) {
        return new Proxy({}, { get(_target, method) {
          return async (...args) => {
            const state = globalThis.__assistantRouteTest;
            state.calls.push({ integrationKey, method, args });
            if (method === "streamRun") return new Response('streamed-result', { headers: { 'Content-Type': 'application/x-ndjson' } });
            return { method, result: "fixture" };
          };
        } });
      }
    `;
    return source ? { shortCircuit: true, format: "module", source } : next(url, context);
  },
});
const route = async (suffix) => import(new URL(`app/api/assistant/[integrationKey]/${suffix}/route.ts`, root));
const config = await route("config");
const runs = await route("runs");
const run = await route("runs/[runId]");
const proposal = await route("runs/[runId]/proposals/[proposalId]");
const threads = await route("threads");
const thread = await route("threads/[threadId]");
const history = await route("threads/[threadId]/history");
const attachments = await route("threads/[threadId]/attachments");
const attachment = await route("threads/[threadId]/attachments/[attachmentId]");

function request(path, method = "GET", body, options = {}) {
  return new Request(`https://app.example.test/api/assistant/fixture/${path}`, {
    method,
    headers: {
      origin: "https://app.example.test",
      ...(body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...options.headers,
    },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
const context = (values = {}) => ({
  params: Promise.resolve({
    integrationKey: "fixture",
    threadId: "thread",
    runId: "run",
    proposalId: "proposal",
    attachmentId: "attachment",
    ...values,
  }),
});
test.beforeEach(() => {
  state.actor = "owner";
  state.status = "active";
  state.calls.length = 0;
});
test.after(() => {
  hooks.deregister();
  delete globalThis.__assistantRouteTest;
});

test("Assistant routes authenticate and validate origins before integration execution", async () => {
  state.actor = null;
  assert.equal((await config.GET(request("config"), context())).status, 401);
  state.actor = "owner";
  state.status = "disabled";
  assert.equal((await config.GET(request("config"), context())).status, 403);
  state.status = "active";
  assert.equal(
    (await runs.POST(request("runs", "POST", {}, { headers: { origin: "https://foreign.example.test" } }), context()))
      .status,
    403,
  );
  assert.equal(state.calls.length, 0);
  const result = await config.GET(request("config"), context());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(state.calls[0], { integrationKey: "fixture", method: "config", args: ["owner"] });
});

test("Assistant thread listing and creation distinguish absent, valid, and invalid resources", async () => {
  await threads.GET(request("threads"), context());
  await threads.GET(request("threads?resourceId=invoice_1"), context());
  await threads.POST(request("threads", "POST", { title: "General conversation" }), context());
  await threads.POST(request("threads?resourceId=invoice_1", "POST", { title: "Invoice" }), context());
  assert.deepEqual(
    state.calls.map(({ method, args }) => [method, args]),
    [
      ["listThreads", ["owner", null]],
      ["listThreads", ["owner", "invoice_1"]],
      ["createThread", ["owner", null, { title: "General conversation" }]],
      ["createThread", ["owner", "invoice_1", { title: "Invoice" }]],
    ],
  );
  for (const query of ["resourceId=", "resourceId=../foreign", `resourceId=${"a".repeat(101)}`]) {
    assert.equal((await threads.GET(request(`threads?${query}`), context())).status, 400);
  }
  assert.equal(state.calls.length, 4);
});

test("Assistant run endpoints preserve request content, abort signal, and proposal outcomes", async () => {
  const abort = new AbortController();
  const input = {
    clientRequestId: "request",
    operation: "prepare_invoice",
    message: "Summarize",
    context: { invoice: "fixture" },
  };
  const streamedRequest = request("runs", "POST", input, { signal: abort.signal });
  const streamed = await runs.POST(streamedRequest, context());
  assert.equal(await streamed.text(), "streamed-result");
  assert.deepEqual(state.calls[0].args.slice(0, 2), ["owner", input]);
  assert.equal(state.calls[0].args[2], streamedRequest.signal);
  abort.abort();
  assert.equal(state.calls[0].args[2].aborted, true);
  await run.GET(request("runs/run"), context());
  await proposal.PATCH(request("runs/run/proposals/proposal", "PATCH", { status: "applied" }), context());
  assert.deepEqual(
    state.calls.slice(1).map(({ method, args }) => [method, args]),
    [
      ["getRun", ["owner", "run"]],
      ["updateProposal", ["owner", "run", "proposal", { status: "applied" }]],
    ],
  );
});

test("known-thread routes resolve stored scope and preserve result pagination and deletion intent", async () => {
  await thread.GET(request("threads/thread?resourceId=forged"), context());
  await thread.GET(request("threads/thread?view=results&cursor=next-page"), context());
  await thread.PATCH(request("threads/thread", "PATCH", { composerDraft: "Keep this draft" }), context());
  await history.DELETE(request("threads/thread/history", "DELETE"), context());
  await thread.DELETE(request("threads/thread", "DELETE"), context());
  assert.deepEqual(
    state.calls.map(({ method, args }) => [method, args]),
    [
      ["getThread", ["owner", undefined, "thread"]],
      ["getThreadExecutions", ["owner", undefined, "thread", "next-page"]],
      ["updateThread", ["owner", undefined, "thread", { composerDraft: "Keep this draft" }]],
      ["removeThreadHistory", ["owner", undefined, "thread"]],
      ["removeThreadHistory", ["owner", undefined, "thread", true]],
    ],
  );
});

test("Assistant attachments preserve filters, link payloads, multipart files and deletion", async () => {
  await attachments.GET(request("threads/thread/attachments?kind=results&cursor=next-page"), context());
  await attachments.POST(
    request("threads/thread/attachments", "POST", { url: "https://example.com/source" }),
    context(),
  );
  const form = new FormData();
  form.set("file", new File([new Uint8Array([137, 80, 78, 71])], "source.png", { type: "image/png" }));
  await attachments.POST(request("threads/thread/attachments", "POST", form), context());
  await attachment.GET(request("threads/thread/attachments/attachment"), context());
  await attachment.DELETE(request("threads/thread/attachments/attachment", "DELETE"), context());
  assert.deepEqual(state.calls[0].args, ["owner", undefined, "thread", "results", "next-page"]);
  assert.deepEqual(state.calls[1].args, ["owner", undefined, "thread", { url: "https://example.com/source" }]);
  assert.equal(state.calls[2].method, "uploadAttachment");
  const file = state.calls[2].args[3];
  assert.ok(file instanceof File);
  assert.equal(file.name, "source.png");
  assert.equal(file.type, "image/png");
  assert.equal(file.size, 4);
  assert.deepEqual(
    state.calls.slice(3).map(({ method, args }) => [method, args]),
    [
      ["getThreadAttachment", ["owner", undefined, "thread", "attachment"]],
      ["removeAttachment", ["owner", undefined, "thread", "attachment"]],
    ],
  );
  assert.equal(
    (await attachments.POST(request("threads/thread/attachments", "POST", new FormData()), context())).status,
    400,
  );
  assert.equal(
    (
      await attachments.POST(
        request("threads/thread/attachments", "POST", {}, { headers: { "content-length": String(7 * 1024 * 1024) } }),
        context(),
      )
    ).status,
    413,
  );
  assert.equal(state.calls.length, 5);
});
