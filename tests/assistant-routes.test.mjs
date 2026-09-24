import { expect, test, vi, beforeEach } from "vitest";

// vi.hoisted runs before the hoisted vi.mock factories so the fake auth and
// integration modules can read the state the tests mutate.
const state = vi.hoisted(() => ({
  actor: "owner",
  status: "active",
  calls: [],
  sessionOptions: null,
  authUnavailable: false,
}));

vi.mock("@/lib/auth/session.ts", () => {
  class AuthServiceError extends Error {}
  return {
    AuthServiceError,
    async getSession(_headers, options) {
      state.sessionOptions = options;
      if (state.authUnavailable) throw new AuthServiceError("Authentication unavailable");
      return state.actor ? { user: { id: state.actor, status: state.status } } : null;
    },
  };
});
vi.mock("@/lib/admin/index.ts", () => ({ AuthorizationError: class AuthorizationError extends Error {} }));
vi.mock("@/app/api/assistant/integrations.ts", () => ({
  getAssistantService(integrationKey) {
    return new Proxy(
      {},
      {
        get(_target, method) {
          return async (...args) => {
            state.calls.push({ integrationKey, method, args });
            if (method === "streamRun")
              return new Response("streamed-result", { headers: { "Content-Type": "application/x-ndjson" } });
            return { method, result: "fixture" };
          };
        },
      },
    );
  },
}));

import * as config from "@/app/api/assistant/[integrationKey]/config/route.ts";
import * as runs from "@/app/api/assistant/[integrationKey]/runs/route.ts";
import * as run from "@/app/api/assistant/[integrationKey]/runs/[runId]/route.ts";
import * as proposal from "@/app/api/assistant/[integrationKey]/runs/[runId]/proposals/[proposalId]/route.ts";
import * as threads from "@/app/api/assistant/[integrationKey]/threads/route.ts";
import * as thread from "@/app/api/assistant/[integrationKey]/threads/[threadId]/route.ts";
import * as history from "@/app/api/assistant/[integrationKey]/threads/[threadId]/history/route.ts";
import * as attachments from "@/app/api/assistant/[integrationKey]/threads/[threadId]/attachments/route.ts";
import * as attachment from "@/app/api/assistant/[integrationKey]/threads/[threadId]/attachments/[attachmentId]/route.ts";

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
beforeEach(() => {
  state.actor = "owner";
  state.status = "active";
  state.calls.length = 0;
  state.sessionOptions = null;
  state.authUnavailable = false;
});

test("Assistant routes authenticate and validate origins before integration execution", async () => {
  state.actor = null;
  expect((await config.GET(request("config"), context())).status).toBe(401);
  state.actor = "owner";
  state.status = "disabled";
  expect((await config.GET(request("config"), context())).status).toBe(403);
  state.status = "active";
  expect(
    (await runs.POST(request("runs", "POST", {}, { headers: { origin: "https://foreign.example.test" } }), context()))
      .status,
  ).toBe(403);
  expect(state.calls.length).toBe(0);
  const result = await config.GET(request("config"), context());
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(state.calls[0]).toEqual({ integrationKey: "fixture", method: "config", args: ["owner"] });
});

test("Assistant routes skip unused admin enrichment and reject unavailable authentication", async () => {
  expect((await config.GET(request("config"), context())).status).toBe(200);
  expect(state.sessionOptions).toEqual({ includeAdmin: false });
  state.calls.length = 0;
  state.authUnavailable = true;
  expect((await config.GET(request("config"), context())).status).toBe(503);
  expect(state.calls.length).toBe(0);
});

test("Assistant thread listing and creation distinguish absent, valid, and invalid resources", async () => {
  await threads.GET(request("threads"), context());
  await threads.GET(request("threads?resourceId=invoice_1"), context());
  await threads.POST(request("threads", "POST", { title: "General conversation" }), context());
  await threads.POST(request("threads?resourceId=invoice_1", "POST", { title: "Invoice" }), context());
  expect(state.calls.map(({ method, args }) => [method, args])).toEqual([
    ["listThreads", ["owner", null]],
    ["listThreads", ["owner", "invoice_1"]],
    ["createThread", ["owner", null, { title: "General conversation" }]],
    ["createThread", ["owner", "invoice_1", { title: "Invoice" }]],
  ]);
  for (const query of ["resourceId=", "resourceId=../foreign", `resourceId=${"a".repeat(101)}`]) {
    expect((await threads.GET(request(`threads?${query}`), context())).status).toBe(400);
  }
  expect(state.calls.length).toBe(4);
});

test("Assistant thread creation accepts the configured admin host when Next normalizes the request URL", async (t) => {
  const previousAppUrl = process.env.APP_URL;
  process.env.APP_URL = "http://localhost:3000";
  t.onTestFinished(() => {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  });
  const resourceId = "4fcf4d4b-e31c-4df3-9e45-7ca7d59237b8";
  const response = await threads.POST(
    new Request(`http://localhost:3000/api/assistant/blog/threads?resourceId=${resourceId}`, {
      method: "POST",
      headers: {
        host: "admin.localhost:3000",
        origin: "http://admin.localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: "Blog conversation" }),
    }),
    context({ integrationKey: "blog" }),
  );
  expect(response.status).toBe(200);
  expect(state.calls).toEqual([
    {
      integrationKey: "blog",
      method: "createThread",
      args: ["owner", resourceId, { title: "Blog conversation" }],
    },
  ]);
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
  expect(await streamed.text()).toBe("streamed-result");
  expect(state.calls[0].args.slice(0, 2)).toEqual(["owner", input]);
  expect(state.calls[0].args[2]).toBe(streamedRequest.signal);
  abort.abort();
  expect(state.calls[0].args[2].aborted).toBe(true);
  await run.GET(request("runs/run"), context());
  await proposal.PATCH(request("runs/run/proposals/proposal", "PATCH", { status: "applied" }), context());
  expect(state.calls.slice(1).map(({ method, args }) => [method, args])).toEqual([
    ["getRun", ["owner", "run"]],
    ["updateProposal", ["owner", "run", "proposal", { status: "applied" }]],
  ]);
});

test("known-thread routes resolve stored scope and preserve result pagination and deletion intent", async () => {
  await thread.GET(request("threads/thread?resourceId=forged"), context());
  await thread.GET(request("threads/thread?view=results&cursor=next-page"), context());
  await thread.PATCH(request("threads/thread", "PATCH", { composerDraft: "Keep this draft" }), context());
  await history.DELETE(request("threads/thread/history", "DELETE"), context());
  await thread.DELETE(request("threads/thread", "DELETE"), context());
  expect(state.calls.map(({ method, args }) => [method, args])).toEqual([
    ["getThread", ["owner", undefined, "thread"]],
    ["getThreadExecutions", ["owner", undefined, "thread", "next-page"]],
    ["updateThread", ["owner", undefined, "thread", { composerDraft: "Keep this draft" }]],
    ["removeThreadHistory", ["owner", undefined, "thread"]],
    ["removeThreadHistory", ["owner", undefined, "thread", true]],
  ]);
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
  expect(state.calls[0].args).toEqual(["owner", undefined, "thread", "results", "next-page"]);
  expect(state.calls[1].args).toEqual(["owner", undefined, "thread", { url: "https://example.com/source" }]);
  expect(state.calls[2].method).toBe("uploadAttachment");
  const file = state.calls[2].args[3];
  expect(file instanceof File).toBeTruthy();
  expect(file.name).toBe("source.png");
  expect(file.type).toBe("image/png");
  expect(file.size).toBe(4);
  expect(state.calls.slice(3).map(({ method, args }) => [method, args])).toEqual([
    ["getThreadAttachment", ["owner", undefined, "thread", "attachment"]],
    ["removeAttachment", ["owner", undefined, "thread", "attachment"]],
  ]);
  expect(
    (await attachments.POST(request("threads/thread/attachments", "POST", new FormData()), context())).status,
  ).toBe(400);
  expect(
    (
      await attachments.POST(
        request("threads/thread/attachments", "POST", {}, { headers: { "content-length": String(7 * 1024 * 1024) } }),
        context(),
      )
    ).status,
  ).toBe(413);
  expect(state.calls.length).toBe(5);
});
