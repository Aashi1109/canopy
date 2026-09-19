import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { transformSync } from "next/dist/build/swc/index.js";

const state = { values: [], index: 0, effects: [], calls: [], toasts: [], request: null };
globalThis.__assistantHookTest = state;
const oldWindow = globalThis.window,
  oldStorage = globalThis.sessionStorage;
globalThis.window = { location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const saved = new Map();
const richComposerContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Draft", marks: [{ type: "bold" }] }] }],
};
globalThis.sessionStorage = {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: (key) => saved.delete(key),
};
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (!context.parentURL?.endsWith("/useBlogAssistant.ts")) return next(specifier, context);
    if (specifier === "@/lib/blog/composerDocument.ts")
      return next(new URL("../lib/blog/composerDocument.ts", import.meta.url).href, context);
    if (specifier === "react")
      return stub(`const s=globalThis.__assistantHookTest;
    const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
    export function useState(initial){const i=s.index++;if(!(i in s.values))s.values[i]=typeof initial==='function'?initial():initial;return [s.values[i],value=>s.values[i]=typeof value==='function'?value(s.values[i]):value];}
    export function useRef(initial){return useState({current:initial})[0];}
    export function useCallback(fn,deps){const i=s.index++;if(!equal(s.values[i]?.deps,deps))s.values[i]={fn,deps};return s.values[i].fn;}
    export function useEffect(effect,deps){const i=s.index++;if(!equal(s.values[i]?.deps,deps)){s.values[i]?.cleanup?.();const item={deps};s.values[i]=item;s.effects.push(()=>item.cleanup=effect());}}
  `);
    if (specifier === "@/components/ui/index.tsx")
      return stub(`export const toast={error(message){globalThis.__assistantHookTest.toasts.push(message);}};`);
    if (specifier === "./assistantApi")
      return stub(`export class AssistantRequestError extends Error {constructor(message,status){super(message);this.status=status;}}
    globalThis.__assistantHookTest.RequestError=AssistantRequestError;
    export const activeRun=status=>['queued','running','unknown'].includes(status);
    export async function streamAssistantRun(body,signal,onEvent){const s=globalThis.__assistantHookTest;if(s.stream)return s.stream(body,signal,onEvent);const result=await assistantRequest('/api/admin/blog/ai/runs',body);onEvent({type:'run',run:result.run});onEvent({type:'completed',run:result.run});return result.run;}
    export function assistantRequest(url,body,method=body===undefined?'GET':'POST'){const s=globalThis.__assistantHookTest;s.calls.push({url,body,method});return s.request(url,body,method);}`);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith("/useBlogAssistant.ts")) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: transformSync(readFileSync(new URL(url), "utf8"), {
        filename: new URL(url).pathname,
        jsc: { parser: { syntax: "typescript" } },
        module: { type: "es6" },
      }).code,
    };
  },
});
const { useBlogAssistant } = await import("../app/admin/(protected)/blog/lib/useBlogAssistant.ts");
function render() {
  state.index = 0;
  const hook = useBlogAssistant("post", "owner");
  for (const effect of state.effects.splice(0)) effect();
  return hook;
}
const config = {
  enabled: true,
  provider: "openai",
  capabilities: {
    images: true,
    structuredOutput: true,
    webSearch: true,
    urlRetrieval: false,
  },
};
const thread = (id) => ({
  id,
  postId: "post",
  title: "New thread",
  settings: {},
  composerDraft: "",
  createdAt: "2026-09-18T00:00:00Z",
  updatedAt: "2026-09-18T00:00:00Z",
});
let serverThreads, serverDetails, onRequest;
async function defaultRequest(url, body, method) {
  if (onRequest) {
    const result = onRequest(url, body, method);
    if (result !== undefined) return result;
  }
  if (url === "/api/admin/blog/ai") return config;
  if (url.endsWith("/threads") && method === "GET") return { threads: serverThreads };
  if (url.endsWith("/threads") && method === "POST") {
    const value = thread(`thread-${serverThreads.length + 1}`);
    value.title = body.title ?? value.title;
    value.settings = body.settings ?? value.settings;
    serverThreads.push(value);
    serverDetails[value.id] = { thread: value, runs: [], messages: [], attachments: [], ...config };
    return { thread: value };
  }
  const id = url.split("/").at(-1);
  if (method === "GET" && serverDetails[id]) return structuredClone(serverDetails[id]);
  if (method === "PATCH" && serverDetails[id]) {
    serverDetails[id].thread = {
      ...serverDetails[id].thread,
      ...(body.composerDraft === undefined ? {} : { composerDraft: body.composerDraft }),
      ...(body.composerState === undefined ? {} : { composerState: body.composerState }),
      settings: { ...serverDetails[id].thread.settings, ...body.settings },
    };
    return { thread: structuredClone(serverDetails[id].thread) };
  }
  throw new state.RequestError("Not found", 404);
}
async function mounted(ids = []) {
  serverThreads = ids.map(thread);
  serverDetails = Object.fromEntries(
    serverThreads.map((value) => [value.id, { thread: value, runs: [], messages: [], attachments: [], ...config }]),
  );
  render();
  await setImmediate();
  return render();
}
const request = (message) => ({
  operation: "chat",
  message,
  editorJson: { type: "doc", content: [] },
  settings: {},
  references: [],
  attachmentIds: [],
});
const run = (input, status = "queued", overrides = {}) => ({
  id: "run",
  threadId: input.threadId,
  postId: "post",
  operation: input.operation,
  request: input,
  status,
  provider: "openai",
  model: "fixture",
  response: null,
  errorMessage: null,
  createdAt: "2026-09-18T00:00:00Z",
  updatedAt: "2026-09-18T00:00:00Z",
  completedAt: null,
  ...overrides,
});
test.beforeEach(() => {
  state.values = [];
  state.index = 0;
  state.effects = [];
  state.calls = [];
  state.toasts = [];
  state.request = defaultRequest;
  state.stream = null;
  saved.clear();
  onRequest = null;
});
test.afterEach(() => {
  for (const value of state.values) value?.cleanup?.();
});
test.after(() => {
  hooks.deregister();
  delete globalThis.__assistantHookTest;
  if (oldWindow === undefined) delete globalThis.window;
  else globalThis.window = oldWindow;
  if (oldStorage === undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage = oldStorage;
});

test("new conversation stays local until its first send and uses that message as its title", async () => {
  let hook = await mounted(["thread-1"]);
  hook.draft("Keep the old conversation draft");
  hook.startNewThread();
  hook = render();
  assert.equal(hook.selected, null);
  assert.equal(hook.message, "");
  assert.equal(hook.threads.length, 1);
  await hook.settings({ tone: "Formal" });
  hook = render();
  assert.equal(hook.requestSettings.tone, "Formal");
  assert.equal(state.calls.filter((call) => call.method === "POST" || call.method === "PATCH").length, 0);
  await hook.refresh();
  assert.equal(render().selected, null);
  hook = render();
  hook.draft("My first question");
  onRequest = (url, body) => (url.endsWith("/ai/runs") ? Promise.resolve({ run: run(body, "failed") }) : undefined);
  await render().send(request("My first question"));
  hook = render();
  assert.equal(hook.threads.length, 2);
  assert.equal(hook.detail.thread.title, "My first question");
  assert.equal(hook.requestSettings.tone, "Formal");
  assert.equal(state.calls.filter((call) => call.url.endsWith("/threads") && call.method === "POST").length, 1);
  await hook.choose("thread-1");
  assert.equal(render().message, "Keep the old conversation draft");
});

test("implicit first thread preserves composer after acknowledged generation failure", async () => {
  let hook = await mounted();
  hook.draft("Keep this message");
  hook = render();
  onRequest = (url, body) => (url.endsWith("/ai/runs") ? Promise.resolve({ run: run(body, "failed") }) : undefined);
  await hook.send(request("Keep this message"));
  hook = render();
  assert.equal(hook.selected, "thread-1");
  assert.equal(hook.message, "Keep this message");
  assert.equal(hook.detail.runs[0].status, "failed");
});

test("chat completion preserves formatting edited while the response is pending", async () => {
  await mounted(["thread-1"]);
  render().draft("Draft");
  render().composerState({ attachmentIds: [], content: richComposerContent });
  let finish;
  state.stream = (input) =>
    new Promise((resolve) => {
      finish = () => resolve(run(input, "completed"));
    });
  const sending = render().send(request("Draft"));
  await setImmediate();
  const editedContent = structuredClone(richComposerContent);
  editedContent.content[0].content[0].marks = [{ type: "italic" }];
  const editedSelection = { attachmentIds: [], content: editedContent };
  render().composerState(editedSelection);
  finish();
  await sending;
  assert.equal(render().message, "Draft");
  assert.deepEqual(render().composerSelection, editedSelection);
});

test("first-thread completion preserves a new instruction entered during the response", async () => {
  await mounted();
  render().draft("Draft");
  render().composerState({ attachmentIds: [], content: richComposerContent });
  let finish;
  state.stream = (input) =>
    new Promise((resolve) => {
      finish = () => resolve(run(input, "completed"));
    });
  const sending = render().send(request("Draft"));
  await setImmediate();
  const content = structuredClone(richComposerContent);
  content.content[0].content[0].text = "Next instruction";
  render().draft("Next instruction");
  render().composerState({ attachmentIds: [], content });
  finish();
  await sending;
  assert.equal(render().message, "Next instruction");
  assert.deepEqual(render().composerSelection.content, content);
});

test("first-thread completion preserves a formatting-only edit", async () => {
  await mounted();
  render().draft("Draft");
  render().composerState({ attachmentIds: [], content: richComposerContent });
  let finish;
  state.stream = (input) =>
    new Promise((resolve) => {
      finish = () => resolve(run(input, "completed"));
    });
  const sending = render().send(request("Draft"));
  await setImmediate();
  const content = structuredClone(richComposerContent);
  content.content[0].content[0].marks = [{ type: "italic" }];
  render().composerState({ attachmentIds: [], content });
  finish();
  await sending;
  assert.equal(render().message, "Draft");
  assert.deepEqual(render().composerSelection.content, content);
});

test("first-thread completion clears matching rich content together with its plain draft", async () => {
  await mounted();
  render().draft("Draft");
  render().composerState({ attachmentIds: [], content: richComposerContent });
  state.stream = async (input) => run(input, "completed");
  await render().send(request("Draft"));
  assert.equal(render().message, "");
  assert.deepEqual(render().composerSelection, { attachmentIds: [] });
  assert.deepEqual(render().composerSelectionsByThread.new, { attachmentIds: [] });
  assert.deepEqual(JSON.parse(saved.get("blog-assistant:owner:post:selection:thread-1")), { attachmentIds: [] });
  assert.equal(saved.get("blog-assistant:owner:post:draft:thread-1"), "");
});
test("an identical retry reuses its key while an explicitly edited submission gets a new key", async () => {
  await mounted(["thread-1"]);
  onRequest = (url) =>
    url.endsWith("/ai/runs") ? Promise.reject(new state.RequestError("Unconfirmed", 503)) : undefined;
  await render().send(request("Original"));
  await render().send(request("Original"));
  await render().send(request("Changed"));
  const calls = state.calls.filter((call) => call.url.endsWith("/ai/runs"));
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body.clientRequestId, calls[1].body.clientRequestId);
  assert.notEqual(calls[1].body.clientRequestId, calls[2].body.clientRequestId);
});
test("late history cannot regress a completed run or route it into another thread", async () => {
  let hook = await mounted(["thread-1", "thread-2"]);
  const input = { ...request("Ask"), threadId: "thread-1", clientRequestId: "client", postId: "post" };
  hook.updateRun(run(input, "completed", { updatedAt: "2026-09-18T00:01:00Z" }));
  hook = render();
  hook.updateRun(run(input));
  hook = render();
  assert.equal(hook.detail.runs[0].status, "completed");
  await hook.choose("thread-2");
  hook = render();
  assert.equal(hook.detail.runs.length, 0);
  hook.updateRun(run(input, "completed", { updatedAt: "2026-09-18T00:02:00Z" }));
  assert.equal(render().detail.runs.length, 0);
});
test("deleted selected thread recovers to a remaining thread", async () => {
  let hook = await mounted(["thread-1", "thread-2"]);
  serverThreads = serverThreads.filter((t) => t.id !== "thread-1");
  delete serverDetails["thread-1"];
  await hook.choose("thread-1");
  hook = render();
  assert.equal(hook.selected, "thread-2");
  assert.equal(hook.error, "");
});
test("settings updates serialize and composer sync failures remain visible", async () => {
  let hook = await mounted(["thread-1"]);
  let release;
  onRequest = (url, body, method) =>
    method === "PATCH" && body.settings?.tone
      ? new Promise((resolve) => {
          release = () => {
            serverDetails["thread-1"].thread.settings.tone = body.settings.tone;
            resolve({ thread: structuredClone(serverDetails["thread-1"].thread) });
          };
        })
      : undefined;
  const first = hook.settings({ tone: "Formal" });
  const second = hook.settings({ webSearch: true });
  await setImmediate();
  assert.equal(state.calls.filter((c) => c.method === "PATCH").length, 1);
  release();
  await Promise.all([first, second]);
  hook = render();
  assert.deepEqual(hook.detail.thread.settings, { tone: "Formal", webSearch: true });
  onRequest = (_url, body, method) =>
    method === "PATCH" && body.composerDraft !== undefined ? Promise.reject(new Error("Offline")) : undefined;
  hook.draft("Private draft");
  await assert.rejects(hook.saveDraft("Private draft", "thread-1"));
  hook = render();
  assert.equal(hook.message, "Private draft");
  assert.match(hook.error, /kept in this browser/);
});

test("thread refresh cannot discard a request acknowledged after its snapshot", async () => {
  let hook = await mounted(["thread-1"]);
  let release;
  onRequest = (url, body, method) =>
    url.endsWith("/thread-1") && method === "GET"
      ? new Promise((resolve) => {
          release = resolve;
        })
      : undefined;
  const choosing = hook.choose("thread-1");
  const input = { ...request("New"), threadId: "thread-1", postId: "post", clientRequestId: "new" };
  hook.updateRun(run(input));
  release(structuredClone(serverDetails["thread-1"]));
  await choosing;
  assert.equal(render().detail.runs[0].request.message, "New");
});

test("clearing history waits for pending composer sync and ignores later stale debounce", async () => {
  let hook = await mounted(["thread-1"]);
  let release;
  onRequest = (url, body, method) => {
    if (method === "PATCH")
      return new Promise((resolve) => {
        release = resolve;
      });
    if (method === "DELETE") {
      serverDetails["thread-1"].runs = [];
      return Promise.resolve({ ok: true });
    }
  };
  const saving = hook.saveDraft("Old message", "thread-1");
  await setImmediate();
  const clearing = hook.remove(true);
  await hook.saveDraft("Stale debounce", "thread-1");
  assert.equal(state.calls.filter((call) => call.method === "PATCH").length, 1);
  assert.equal(state.calls.filter((call) => call.method === "DELETE").length, 0);
  release({ thread: thread("thread-1") });
  await saving;
  await clearing;
  assert.equal(state.calls.filter((call) => call.method === "DELETE").length, 1);
  assert.equal(render().message, "");
});

test("an unsent new-conversation draft survives reload before the first thread exists", async () => {
  saved.set("blog-assistant:owner:post:draft:new", "Keep my first question.");
  saved.set("blog-assistant:owner:post:selection:new", JSON.stringify({ agentId: "planner", attachmentIds: [] }));
  const hook = await mounted();
  assert.equal(hook.selected, null);
  assert.equal(hook.message, "Keep my first question.");
  assert.deepEqual(hook.composerSelection, { agentId: "planner", attachmentIds: [] });
  assert.equal(
    state.calls.some((call) => call.method === "POST"),
    false,
  );
});

test("Send is guarded by the local stream only and switching threads keeps the original request alive", async () => {
  let hook = await mounted(["thread-1", "thread-2"]);
  let finish;
  let signal;
  let submissions = 0;
  state.stream = (input, abort, onEvent) => {
    submissions++;
    signal = abort;
    onEvent({ type: "run", run: run(input, "running") });
    return new Promise((resolve) => {
      finish = () => resolve(run(input, "completed"));
    });
  };
  const sending = hook.send(request("Ask"));
  await setImmediate();
  hook = render();
  assert.equal(hook.submitting, true);
  await hook.send(request("Duplicate"));
  assert.equal(submissions, 1);
  await hook.choose("thread-2");
  hook = render();
  assert.equal(hook.submitting, false);
  assert.equal(signal.aborted, false);
  finish();
  await sending;
  hook = render();
  assert.equal(hook.selected, "thread-2");
  assert.equal(
    state.calls.some((call) => /ai\/runs\//.test(call.url)),
    false,
  );
});

test("history stays loading until a successful empty list resolves", async () => {
  let release;
  onRequest = (url, _body, method) =>
    url.endsWith("/threads") && method === "GET"
      ? new Promise((resolve) => {
          release = resolve;
        })
      : undefined;
  const hook = await mounted();
  assert.equal(hook.historyStatus, "loading");
  release({ threads: [] });
  await setImmediate();
  assert.equal(render().historyStatus, "ready");
  assert.deepEqual(render().threads, []);
});

test("failed initial history is an error and retry can return an empty history", async () => {
  onRequest = (url, _body, method) =>
    url.endsWith("/threads") && method === "GET" ? Promise.reject(new Error("Offline")) : undefined;
  let hook = await mounted();
  assert.equal(hook.historyStatus, "error");
  assert.deepEqual(hook.threads, []);
  assert.deepEqual(state.toasts, []);
  let release;
  onRequest = (url, _body, method) =>
    url.endsWith("/threads") && method === "GET"
      ? new Promise((resolve) => {
          release = resolve;
        })
      : undefined;
  const retry = hook.refresh();
  assert.equal(render().historyStatus, "loading");
  release({ threads: [] });
  await retry;
  hook = render();
  assert.equal(hook.historyStatus, "ready");
  assert.equal(hook.error, "");
});

test("failed history refresh preserves cached threads and reports a toast", async () => {
  let hook = await mounted(["thread-1"]);
  onRequest = (url, _body, method) =>
    url.endsWith("/threads") && method === "GET" ? Promise.reject(new Error("Offline")) : undefined;
  await hook.refresh();
  hook = render();
  assert.equal(hook.historyStatus, "error");
  assert.deepEqual(
    hook.threads.map((item) => item.id),
    ["thread-1"],
  );
  assert.equal(hook.detail.thread.id, "thread-1");
  assert.deepEqual(state.toasts, ["Offline"]);
});

test("thread detail failure does not turn a loaded history into an error", async () => {
  onRequest = (url) => (url.endsWith("/thread-1") ? Promise.reject(new Error("Detail unavailable")) : undefined);
  const hook = await mounted(["thread-1"]);
  assert.equal(hook.historyStatus, "ready");
  assert.equal(hook.threads.length, 1);
  assert.equal(hook.error, "Detail unavailable");
  assert.deepEqual(state.toasts, []);
});

test("configuration failure does not discard a successfully loaded history", async () => {
  onRequest = (url) => (url.endsWith("/ai") ? Promise.reject(new Error("Configuration unavailable")) : undefined);
  const hook = await mounted(["thread-1"]);
  assert.equal(hook.historyStatus, "ready");
  assert.equal(hook.threads.length, 1);
  assert.equal(hook.detail.thread.id, "thread-1");
});

test("proposal actions belong to fresh completions and are never restored by history", async () => {
  await mounted(["thread-1", "thread-2"]);
  state.stream = async (input, _signal, onEvent) => {
    const completed = run(input, "completed");
    serverDetails[input.threadId].runs = [completed];
    onEvent({ type: "run", run: run(input, "running") });
    onEvent({ type: "completed", run: completed });
    return completed;
  };
  assert.deepEqual(render().freshRunIds, []);
  await render().send(request("Suggest a section"));
  assert.deepEqual(render().freshRunIds, ["run"]);
  await render().choose("thread-1");
  assert.deepEqual(render().freshRunIds, []);
  assert.equal(render().detail.runs[0].status, "completed");
  await render().send(request("Another suggestion"));
  assert.deepEqual(render().freshRunIds, ["run"]);
  await render().refresh();
  assert.deepEqual(render().freshRunIds, []);
  assert.equal(
    [...saved.keys()].some((key) => key.includes("decision") || key.includes("proposal")),
    false,
  );
});

test("a completed proposal stays usable when the final history refresh fails", async () => {
  await mounted(["thread-1"]);
  const proposal = { toolCallId: "edit", type: "edit", status: "pending", originalText: "Opening", replacement: [] };
  state.stream = async (input, _signal, onEvent) => {
    const completed = run(input, "completed", {
      inputMessageId: "user",
      assistantMessageId: "assistant",
      response: {
        text: "A clearer opening",
        proposals: [proposal],
        findings: [],
        keywords: [],
        citations: [],
        searchStatus: "not_requested",
      },
    });
    onEvent({ type: "run", run: { ...completed, status: "running", response: null } });
    onEvent({ type: "completed", run: completed });
    return completed;
  };
  onRequest = (url) => (url.endsWith("/thread-1") ? Promise.reject(new Error("History unavailable")) : undefined);
  const completed = await render().send(request("Improve the opening"));
  const hook = render();
  assert.equal(completed?.status, "completed");
  assert.deepEqual(hook.freshRunIds, ["run"]);
  assert.equal(hook.detail.messages.find((message) => message.id === "user").parts[0].text, "Improve the opening");
  assert.deepEqual(hook.detail.messages.find((message) => message.id === "assistant").parts, [
    { type: "text", text: "A clearer opening" },
    { type: "proposal", proposal },
  ]);
});

test("agent completion survives history failure without inventing a chat message", async () => {
  await mounted(["thread-1"]);
  state.stream = async (input, _signal, onEvent) => {
    const completed = run(input, "completed", {
      inputMessageId: null,
      assistantMessageId: null,
      response: {
        text: "",
        proposals: [],
        findings: [],
        keywords: [],
        citations: [],
        searchStatus: "not_requested",
        artifact: { attachmentId: "artifact", label: "Audit", agentId: "auditor", summary: "A complete review" },
      },
    });
    onEvent({ type: "run", run: { ...completed, status: "running", response: null } });
    onEvent({ type: "completed", run: completed });
    return completed;
  };
  onRequest = (url) => (url.endsWith("/thread-1") ? Promise.reject(new Error("History unavailable")) : undefined);
  const result = await render().send({ operation: "agent", agentId: "auditor", message: "Review" });
  assert.equal(result.status, "completed");
  assert.equal(render().detail.executions[0].artifact.attachmentId, "artifact");
  assert.equal(render().detail.executions[0].requestMessage, "Review");
  assert.deepEqual(render().detail.messages, []);
});

test("agent and attachment selection restores independently for each thread and syncs with draft", async () => {
  await mounted(["thread-1", "thread-2"]);
  const selection = { agentId: "writer", agentOffset: 4, attachmentIds: ["plan"], content: richComposerContent };
  render().composerState(selection);
  render().draft("Use this plan");
  await render().saveDraft("Use this plan", "thread-1");
  const patch = state.calls.find((call) => call.method === "PATCH" && call.body.composerDraft === "Use this plan");
  assert.deepEqual(patch.body.composerState, selection);
  await render().choose("thread-2");
  assert.deepEqual(render().composerSelection, { attachmentIds: [] });
  render().composerState({ agentId: "auditor", attachmentIds: [] });
  await render().choose("thread-1");
  assert.deepEqual(render().composerSelection, selection);
  assert.equal(render().message, "Use this plan");
});

test("inline agent positions restore from local selections for new and existing conversations", async () => {
  const selection = { agentId: "writer", agentOffset: 5, attachmentIds: ["plan"], content: richComposerContent };
  saved.set("blog-assistant:owner:post:selection:new", JSON.stringify(selection));
  saved.set("blog-assistant:owner:post:selection:thread-1", JSON.stringify(selection));
  await mounted(["thread-1"]);
  assert.deepEqual(render().composerSelection, selection);
  assert.deepEqual(render().composerSelectionsByThread.new, selection);
});

test("invalid local inline positions fall back without dropping agent or attachments", async () => {
  const selection = { agentId: "writer", attachmentIds: ["plan"] };
  saved.set("blog-assistant:owner:post:selection:new", JSON.stringify({ ...selection, agentOffset: -1 }));
  saved.set("blog-assistant:owner:post:selection:thread-1", JSON.stringify({ ...selection, agentOffset: 8001 }));
  await mounted(["thread-1"]);
  assert.deepEqual(render().composerSelection, selection);
  assert.deepEqual(render().composerSelectionsByThread.new, selection);
});

test("unsafe local rich content is omitted without dropping the agent selection", async () => {
  const selection = { agentId: "writer", agentOffset: 5, attachmentIds: ["plan"] };
  const content = { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/x" } }] };
  saved.set("blog-assistant:owner:post:selection:new", JSON.stringify({ ...selection, content }));
  saved.set("blog-assistant:owner:post:selection:thread-1", JSON.stringify({ ...selection, content }));
  await mounted(["thread-1"]);
  assert.deepEqual(render().composerSelection, selection);
  assert.deepEqual(render().composerSelectionsByThread.new, selection);
});

test("server inline agent positions restore when no local selection exists", async () => {
  const selection = { agentId: "writer", agentOffset: 5, attachmentIds: ["plan"], content: richComposerContent };
  onRequest = (url, _body, method) => {
    if (method === "GET" && url.endsWith("/thread-1"))
      return { ...serverDetails["thread-1"], thread: { ...thread("thread-1"), composerState: selection } };
  };
  await mounted(["thread-1"]);
  assert.deepEqual(render().composerSelection, selection);
});

test("late running activity cannot regress a terminal agent execution", async () => {
  let hook = await mounted(["thread-1"]);
  const input = {
    ...request("Audit"),
    operation: "agent",
    agentId: "auditor",
    threadId: "thread-1",
    clientRequestId: "agent",
    postId: "post",
  };
  hook.updateRun(run(input, "failed", { operation: "agent", updatedAt: "2026-09-18T00:01:00Z" }));
  hook = render();
  const entry = hook.detail.executions[0];
  serverDetails["thread-1"].executions = [{ ...entry, status: "running", updatedAt: "2026-09-18T00:00:00Z" }];
  await hook.refresh();
  assert.equal(render().detail.executions[0].status, "failed");
});
