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
    if (!context.parentURL?.endsWith("/useAssistant.ts")) return next(specifier, context);
    if (specifier === "@/lib/assistant/composerDocument.ts")
      return next(new URL("../lib/assistant/composerDocument.ts", import.meta.url).href, context);
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
    if (specifier === "./client")
      return stub(`export class AssistantRequestError extends Error {constructor(message,status){super(message);this.status=status;}}
    globalThis.__assistantHookTest.RequestError=AssistantRequestError;
    export const activeRun=status=>['queued','running','unknown'].includes(status);
    export const assistantApiBase=integration=>"/api/assistant/"+integration;
    export const assistantCacheKey=(owner,integration,resource)=>"assistant:"+JSON.stringify([owner,integration,resource??null]);
    export async function streamAssistantRun(integration,body,signal,onEvent){const s=globalThis.__assistantHookTest;if(s.stream)return s.stream(body,signal,onEvent);const result=await assistantRequest('/api/assistant/fixture/runs',body);onEvent({type:'run',run:result.run});onEvent({type:'completed',run:result.run});return result.run;}
    export function assistantRequest(url,body,method=body===undefined?'GET':'POST'){const s=globalThis.__assistantHookTest;s.calls.push({url,body,method});return s.request(url,body,method);}`);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith("/useAssistant.ts")) return next(url, context);
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
const { useAssistant } = await import("../lib/assistant/useAssistant.ts");
let currentScope = ["fixture", "post", "owner"];
function render() {
  state.index = 0;
  const hook = useAssistant(...currentScope);
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
  resourceId: "post",
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
  if (url.endsWith("/config")) return config;
  if (url.endsWith("/threads?resourceId=post") && method === "GET") return { threads: serverThreads };
  if (url.endsWith("/threads?resourceId=post") && method === "POST") {
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
  context: { editorJson: { type: "doc", content: [] } },
  settings: {},
  references: [],
  attachmentIds: [],
});
const run = (input, status = "queued", overrides = {}) => ({
  id: "run",
  threadId: input.threadId,
  resourceId: "post",
  operation: input.operation,
  executionMode: input.operation === "agent" ? "standalone" : "conversational",
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
  currentScope = ["fixture", "post", "owner"];
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
  onRequest = (url, body) => (url.endsWith("/runs") ? Promise.resolve({ run: run(body, "failed") }) : undefined);
  await render().send(request("My first question"));
  hook = render();
  assert.equal(hook.threads.length, 2);
  assert.equal(hook.detail.thread.title, "My first question");
  assert.equal(hook.requestSettings.tone, "Formal");
  assert.equal(
    state.calls.filter((call) => call.url.endsWith("/threads?resourceId=post") && call.method === "POST").length,
    1,
  );
  await hook.choose("thread-1");
  assert.equal(render().message, "Keep the old conversation draft");
});

test("the first accepted request titles an existing empty conversation without fetching history", async () => {
  await mounted(["thread-1"]);
  let finish;
  state.stream = (input, _signal, onEvent) =>
    new Promise((resolve) => {
      const accepted = run(input, "running", { inputMessageId: "user", assistantMessageId: "assistant" });
      onEvent({ type: "run", run: accepted });
      finish = () => resolve({ ...accepted, status: "completed" });
    });
  const callsBeforeSend = state.calls.length;
  const sending = render().send(request("Explain this section"));
  assert.equal(render().threads[0].title, "Explain this section");
  assert.equal(render().detail.thread.title, "Explain this section");
  assert.deepEqual(
    state.calls.slice(callsBeforeSend).filter((call) => call.method === "GET"),
    [],
  );
  finish();
  await sending;
});

test("a new conversation does not inherit standalone executions or pagination from the last opened thread", async () => {
  const execution = { id: "old-execution", threadId: "thread-1", status: "completed" };
  onRequest = (url, _body, method) =>
    method === "GET" && url.endsWith("/thread-1")
      ? { ...serverDetails["thread-1"], executions: [execution], executionsCursor: "old-cursor" }
      : undefined;
  await mounted(["thread-1"]);
  assert.deepEqual(render().detail.executions, [execution]);
  render().startNewThread();
  state.stream = async (input) => run(input, "completed");
  const sending = render().send(request("New question"));
  assert.deepEqual(render().detail.executions ?? [], []);
  assert.equal(render().detail.executionsCursor ?? null, null);
  await sending;
  assert.equal(render().selected, "thread-2");
  assert.deepEqual(render().detail.executions ?? [], []);
  assert.equal(render().detail.executionsCursor ?? null, null);
});

test("an unavailable configuration response does not prevent local new-thread initialization", async () => {
  onRequest = (url) => (url.endsWith("/config") ? Promise.reject(new Error("Configuration unavailable")) : undefined);
  await mounted();
  assert.equal(render().availability, null);
  state.stream = async (input) => run(input, "failed");
  const result = await render().send(request("Draft"));
  assert.equal(result.status, "failed");
  assert.equal(render().selected, "thread-1");
  assert.equal(render().detail.thread.title, "Draft");
  assert.equal(render().message, "Draft");
});

test("implicit first thread preserves composer after acknowledged generation failure", async () => {
  let hook = await mounted();
  hook.draft("Keep this message");
  hook = render();
  onRequest = (url, body) => (url.endsWith("/runs") ? Promise.resolve({ run: run(body, "failed") }) : undefined);
  await hook.send(request("Keep this message"));
  hook = render();
  assert.equal(hook.selected, "thread-1");
  assert.equal(hook.message, "Keep this message");
  assert.equal(hook.detail.runs[0].status, "failed");
});

test("refresh preserves a failed first query alongside a newer draft when thread creation failed", async () => {
  await mounted();
  render().draft("First query");
  let rejectCreation;
  onRequest = (url, _body, method) =>
    method === "POST" && url.endsWith("/threads?resourceId=post")
      ? new Promise((_resolve, reject) => {
          rejectCreation = reject;
        })
      : undefined;
  const sending = render().send(request("First query"));
  render().draft("Newer draft");
  rejectCreation(new Error("Thread unavailable"));
  await sending;
  await render().refresh();
  const hook = render();
  assert.equal(hook.message, "Newer draft");
  assert.equal(hook.detail.messages[0].parts[0].text, "First query");
  assert.equal(hook.detail.messages[0].meta.failed, true);
});

for (const conversation of ["existing", "new"])
  test(`${conversation} conversation displays the submitted query and clears its rich composer before acknowledgment`, async () => {
    await mounted(conversation === "existing" ? ["thread-1"] : []);
    render().draft("Draft");
    render().composerState({ attachmentIds: ["source"], content: richComposerContent });
    let acknowledge;
    let finish;
    state.stream = (input, _signal, onEvent) =>
      new Promise((resolve) => {
        const accepted = run(input, "running", { inputMessageId: "saved-user", assistantMessageId: "saved-assistant" });
        acknowledge = () => onEvent({ type: "run", run: accepted });
        finish = () => {
          const completed = { ...accepted, status: "completed" };
          onEvent({ type: "completed", run: completed });
          resolve(completed);
        };
      });
    const sending = render().send({ ...request("Draft"), attachmentIds: ["source"] });
    let hook = render();
    assert.equal(hook.message, "");
    assert.deepEqual(hook.composerSelection, { attachmentIds: [] });
    assert.equal(hook.submitting, true);
    assert.deepEqual(
      hook.detail.messages.map((message) => [message.role, message.parts]),
      [
        [
          "user",
          [
            { type: "text", text: "Draft" },
            { type: "attachment", attachmentId: "source" },
          ],
        ],
      ],
    );
    await setImmediate();
    acknowledge();
    hook = render();
    assert.equal(hook.detail.messages.filter((message) => message.role === "user").length, 1);
    assert.equal(hook.detail.messages.find((message) => message.role === "user").id, "saved-user");
    finish();
    await sending;
    assert.equal(render().submitting, false);
  });

for (const followUp of [false, true])
  test(`failed send ${followUp ? "preserves a newer draft" : "restores the submitted rich draft"}`, async () => {
    await mounted(["thread-1"]);
    render().draft("Draft");
    render().composerState({ attachmentIds: ["source"], content: richComposerContent });
    let fail;
    state.stream = () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      });
    const sending = render().send({ ...request("Draft"), attachmentIds: ["source"] });
    await setImmediate();
    if (followUp) {
      render().draft("Next question");
      render().composerState({ attachmentIds: ["next-source"] });
    }
    fail(new Error("Offline"));
    assert.equal(await sending, null);
    assert.equal(render().message, followUp ? "Next question" : "Draft");
    assert.deepEqual(
      render().composerSelection,
      followUp ? { attachmentIds: ["next-source"] } : { attachmentIds: ["source"], content: richComposerContent },
    );
    assert.equal(render().submitting, false);
  });

test("chat completion preserves a new rich draft entered while the response is pending", async () => {
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
  render().draft("Draft");
  render().composerState(editedSelection);
  finish();
  await sending;
  assert.equal(render().message, "Draft");
  assert.deepEqual(render().composerSelection, editedSelection);
});

test("completion preserves an identical follow-up after the composer was cleared for send", async () => {
  await mounted(["thread-1"]);
  let finish;
  state.stream = (input) =>
    new Promise((resolve) => {
      finish = () => resolve(run(input, "completed"));
    });
  const sending = render().send(request("Ask again"));
  await setImmediate();
  render().draft("Ask again");
  finish();
  await sending;
  assert.equal(render().message, "Ask again");
});

test("reference preparation preserves a follow-up entered before the run is submitted", async () => {
  await mounted(["thread-1"]);
  render().draft("Same question");
  let finishLink;
  onRequest = (url, _body, method) =>
    url.endsWith("/attachments") && method === "POST"
      ? new Promise((resolve) => {
          finishLink = () => resolve({ attachment: { id: "source", threadId: "thread-1", label: "Source" } });
        })
      : undefined;
  let submitted;
  state.stream = async (input) => {
    submitted = input;
    return run(input, "completed");
  };
  const sending = render().send(request("Same question"), undefined, "thread-1", {
    referenceLinks: ["https://example.com/source"],
  });
  await setImmediate();
  assert.equal(render().message, "");
  assert.equal(render().submitting, true);
  render().draft("Same question");
  finishLink();
  await sending;
  assert.equal(render().message, "Same question");
  assert.deepEqual(submitted.attachmentIds, ["source"]);
});

test("stopping reference preparation preserves the draft and completed links without dispatching a run", async () => {
  await mounted(["thread-1"]);
  render().draft("Draft");
  render().composerState({ attachmentIds: [], content: richComposerContent });
  let finishLink;
  const remainingLinks = [];
  const attachment = { id: "source", threadId: "thread-1", messageId: null, type: "link", label: "Source" };
  onRequest = (url, _body, method) =>
    url.endsWith("/attachments") && method === "POST"
      ? new Promise((resolve) => {
          finishLink = () => {
            serverDetails["thread-1"].attachments.push(attachment);
            resolve({ attachment });
          };
        })
      : undefined;
  let submissions = 0;
  state.stream = async (input) => {
    submissions++;
    return run(input, "completed");
  };
  const sending = render().send(request("Draft"), undefined, "thread-1", {
    referenceLinks: ["https://example.com/first", "https://example.com/second"],
    onReferenceAdded: (id, links) => remainingLinks.push({ id, links }),
  });
  await setImmediate();
  await render().stop();
  finishLink();
  assert.equal(await sending, null);
  await setImmediate();
  const hook = render();
  assert.equal(submissions, 0);
  assert.equal(hook.submitting, false);
  assert.equal(hook.message, "Draft");
  assert.deepEqual(hook.composerSelection, { attachmentIds: ["source"], content: richComposerContent });
  assert.deepEqual(remainingLinks, [{ id: "thread-1", links: ["https://example.com/second"] }]);
  assert.deepEqual(hook.detail.attachments, [attachment]);
  assert.deepEqual(hook.detail.messages, []);
  assert.equal(state.calls.filter((call) => call.url.endsWith("/attachments")).length, 1);
});

test("accepted chat binds its source attachments while artifacts and unselected sources remain reusable", async () => {
  await mounted(["thread-1"]);
  for (const [id, type] of [
    ["source", "link"],
    ["artifact", "artifact"],
    ["unused", "image"],
  ])
    render().rememberAttachment({ id, type, threadId: "thread-1", messageId: null, label: id });
  let acknowledge;
  let finish;
  state.stream = (input, _signal, onEvent) =>
    new Promise((resolve) => {
      const accepted = run(input, "running", { inputMessageId: "user", assistantMessageId: "assistant" });
      acknowledge = () => onEvent({ type: "run", run: accepted });
      finish = () => resolve({ ...accepted, status: "completed" });
    });
  const sending = render().send({ ...request("Use these"), attachmentIds: ["source", "artifact"] });
  assert.deepEqual(
    render().detail.attachments.map((file) => file.messageId),
    [null, null, null],
  );
  acknowledge();
  assert.deepEqual(
    render().detail.attachments.map((file) => [file.id, file.messageId]),
    [
      ["source", "user"],
      ["artifact", null],
      ["unused", null],
    ],
  );
  finish();
  await sending;
  assert.deepEqual(render().detail.messages.find((message) => message.id === "user").parts, [
    { type: "text", text: "Use these" },
    { type: "attachment", attachmentId: "source" },
    { type: "attachment", attachmentId: "artifact" },
  ]);
});

test("full-text stream events replace previous deltas and an interrupted response retains the latest partial answer", async () => {
  await mounted(["thread-1"]);
  let emit;
  let fail;
  state.stream = (input, _signal, onEvent) =>
    new Promise((_resolve, reject) => {
      emit = onEvent;
      fail = reject;
      onEvent({ type: "run", run: run(input, "running", { inputMessageId: "user", assistantMessageId: "assistant" }) });
    });
  const sending = render().send(request("Ask"));
  emit({ type: "text-delta", text: "First draft" });
  assert.equal(render().stream.text, "First draft");
  emit({ type: "text", text: "Corrected answer" });
  assert.equal(render().stream.text, "Corrected answer");
  emit({ type: "text-delta", text: " continues" });
  assert.equal(render().stream.text, "Corrected answer continues");
  fail(new Error("Connection interrupted"));
  assert.equal(await sending, null);
  const hook = render();
  assert.equal(hook.submitting, false);
  assert.equal(hook.detail.runs[0].status, "unknown");
  assert.deepEqual(hook.detail.messages.find((message) => message.id === "assistant").parts, [
    { type: "text", text: "Corrected answer continues" },
  ]);
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

test("first-thread completion preserves a new rich draft with the same text", async () => {
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
  render().draft("Draft");
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
  assert.deepEqual(JSON.parse(saved.get('assistant:["owner","fixture","post"]:selection:thread-1')), {
    attachmentIds: [],
  });
  assert.equal(saved.get('assistant:["owner","fixture","post"]:draft:thread-1'), "");
});
test("an identical retry reuses its key while an explicitly edited submission gets a new key", async () => {
  await mounted(["thread-1"]);
  onRequest = (url) => (url.endsWith("/runs") ? Promise.reject(new state.RequestError("Unconfirmed", 503)) : undefined);
  await render().send(request("Original"));
  await render().send(request("Original"));
  await render().send(request("Changed"));
  const calls = state.calls.filter((call) => call.url.endsWith("/runs"));
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body.clientRequestId, calls[1].body.clientRequestId);
  assert.notEqual(calls[1].body.clientRequestId, calls[2].body.clientRequestId);
});
test("late history cannot regress a completed run or route it into another thread", async () => {
  let hook = await mounted(["thread-1", "thread-2"]);
  const input = { ...request("Ask"), threadId: "thread-1", clientRequestId: "client", resourceId: "post" };
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
  const input = { ...request("New"), threadId: "thread-1", resourceId: "post", clientRequestId: "new" };
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
  saved.set('assistant:["owner","fixture","post"]:draft:new', "Keep my first question.");
  saved.set(
    'assistant:["owner","fixture","post"]:selection:new',
    JSON.stringify({ agentId: "planner", attachmentIds: [] }),
  );
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

function controlledStreams() {
  const streams = new Map();
  state.stream = (input, signal, onEvent) => {
    const current = run(input, "running", { id: `run-${input.threadId}` });
    serverDetails[input.threadId].runs = [current];
    onEvent({ type: "run", run: current });
    return new Promise((resolve, reject) => {
      streams.set(input.threadId, {
        signal,
        delta: (text) => onEvent({ type: "text-delta", text }),
        complete: () => {
          const completed = { ...current, status: "completed", completedAt: "2026-09-18T00:01:00Z" };
          serverDetails[input.threadId].runs = [completed];
          onEvent({ type: "completed", run: completed });
          resolve(completed);
        },
      });
      signal.addEventListener("abort", () => {
        serverDetails[input.threadId].runs = [{ ...current, status: "cancelled" }];
        reject(new DOMException("Stopped", "AbortError"));
      });
    });
  };
  return streams;
}

test("new and existing conversations run in parallel with separate streams and drafts", async () => {
  await mounted(["thread-1"]);
  const streams = controlledStreams();
  render().draft("First question");
  const first = render().send(request("First question"));
  await setImmediate();
  render().startNewThread();
  assert.equal(render().submitting, false);
  render().draft("Second question");
  render().composerState({ attachmentIds: ["second-source"] });
  const second = render().send(request("Second question"));
  await setImmediate();
  assert.equal(render().selected, "thread-2");
  assert.deepEqual(render().activeThreadIds.sort(), ["thread-1", "thread-2"]);
  streams.get("thread-1").delta("First answer");
  streams.get("thread-2").delta("Second answer");
  assert.equal(render().stream.text, "Second answer");
  await render().choose("thread-1");
  assert.equal(render().stream.text, "First answer");
  assert.equal(render().message, "");
  assert.deepEqual(render().composerSelection, { attachmentIds: [] });
  render().draft("First follow-up");
  streams.get("thread-2").complete();
  await second;
  assert.equal(render().selected, "thread-1");
  assert.equal(render().submitting, true);
  assert.equal(render().message, "First follow-up");
  assert.equal(streams.get("thread-1").signal.aborted, false);
  streams.get("thread-1").complete();
  await first;
  assert.equal(render().message, "First follow-up");
  assert.deepEqual(render().activeThreadIds, []);
  await render().choose("thread-2");
  assert.equal(render().message, "");
  assert.deepEqual(render().composerSelection, { attachmentIds: [] });
  assert.equal(render().detail.runs[0].request.message, "Second question");
  assert.equal(render().detail.runs[0].status, "completed");
});

test("Stop only cancels the selected conversation while another stream completes", async () => {
  await mounted(["thread-1", "thread-2"]);
  const streams = controlledStreams();
  const first = render().send(request("First question"));
  await setImmediate();
  await render().choose("thread-2");
  const second = render().send(request("Second question"));
  await setImmediate();
  await render().stop();
  await second;
  assert.equal(streams.get("thread-2").signal.aborted, true);
  assert.equal(streams.get("thread-1").signal.aborted, false);
  assert.deepEqual(render().activeThreadIds, ["thread-1"]);
  assert.equal(render().submitting, false);
  assert.equal(render().detail.runs[0].status, "cancelled");
  streams.get("thread-1").complete();
  await first;
  assert.equal(render().selected, "thread-2");
  await render().choose("thread-1");
  assert.equal(render().detail.runs[0].status, "completed");
});

test("switching during thread creation does not block or reopen the destination conversation", async () => {
  await mounted(["thread-1"]);
  const streams = controlledStreams();
  let finishCreation;
  onRequest = (url, body, method) => {
    if (url.endsWith("/threads?resourceId=post") && method === "POST")
      return new Promise((resolve) => {
        finishCreation = () => {
          const created = { ...thread("thread-2"), title: body.title };
          serverThreads.push(created);
          serverDetails[created.id] = { thread: created, runs: [], messages: [], attachments: [], ...config };
          resolve({ thread: created });
        };
      });
  };
  render().startNewThread();
  render().draft("New question");
  const creating = render().send(request("New question"));
  await setImmediate();
  await render().choose("thread-1");
  assert.equal(render().submitting, false);
  render().draft("Existing question");
  const existing = render().send(request("Existing question"));
  await setImmediate();
  finishCreation();
  await setImmediate();
  assert.equal(render().selected, "thread-1");
  assert.equal(render().message, "");
  assert.deepEqual(render().activeThreadIds.sort(), ["thread-1", "thread-2"]);
  streams.get("thread-2").complete();
  streams.get("thread-1").complete();
  await Promise.all([creating, existing]);
  assert.equal(render().selected, "thread-1");
});

test("two unsaved conversations can create and send concurrently without sharing locks or composer state", async () => {
  await mounted();
  const streams = controlledStreams();
  const creations = [];
  onRequest = (url, body, method) => {
    if (url.endsWith("/threads?resourceId=post") && method === "POST")
      return new Promise((resolve) => {
        const id = `thread-${creations.length + 1}`;
        creations.push(() => {
          const created = { ...thread(id), title: body.title, settings: body.settings };
          serverThreads.push(created);
          serverDetails[id] = { thread: created, runs: [], messages: [], attachments: [], ...config };
          resolve({ thread: created });
        });
      });
  };
  const firstScope = render().scopeId;
  await render().settings({ tone: "Formal" });
  render().draft("Same question");
  const first = render().send(request("Same question"));
  await setImmediate();
  render().startNewThread();
  const secondScope = render().scopeId;
  assert.notEqual(firstScope, secondScope);
  assert.equal(render().submitting, false);
  await render().settings({ tone: "Friendly" });
  render().draft("Same question");
  const second = render().send(request("Same question"));
  await setImmediate();
  assert.equal(creations.length, 2);
  creations[0]();
  await setImmediate();
  assert.equal(render().selected, null);
  assert.equal(render().scopeId, secondScope);
  streams.get("thread-1").complete();
  await first;
  assert.equal(render().submitting, true);
  assert.equal(render().message, "");
  assert.equal(await render().send(request("Duplicate")), undefined);
  creations[1]();
  await setImmediate();
  assert.equal(render().selected, "thread-2");
  assert.equal(render().resolveScopeId(firstScope), "thread-1");
  assert.equal(render().resolveScopeId(secondScope), "thread-2");
  assert.deepEqual(serverDetails["thread-1"].thread.settings, { tone: "Formal" });
  assert.deepEqual(render().requestSettings, { tone: "Friendly" });
  assert.equal(streams.get("thread-2").signal.aborted, false);
  streams.get("thread-2").complete();
  await second;
  assert.equal(render().message, "");
  assert.deepEqual(render().activeThreadIds, []);
});

for (const conversation of ["existing", "new"])
  test(`attachment preparation and send keep their captured ${conversation} conversation after navigation`, async () => {
    await mounted(["thread-1", "thread-2"]);
    if (conversation === "new") render().startNewThread();
    const streams = controlledStreams();
    const targetScope = render().scopeId;
    const targetId = conversation === "new" ? "thread-3" : "thread-1";
    let finishLink;
    onRequest = (url, _body, method) => {
      if (url.endsWith("/attachments") && method === "POST")
        return new Promise((resolve) => {
          finishLink = () => resolve({ attachment: { id: "source", threadId: targetId, label: "Source" } });
        });
    };
    const link = render().addLink("https://example.com/source", targetScope);
    await setImmediate();
    await render().choose("thread-2");
    render().draft("Second thread draft");
    finishLink();
    const attachment = await link;
    const sending = render().send(
      { ...request("Use this source"), attachmentIds: [attachment.id] },
      undefined,
      targetScope,
    );
    await setImmediate();
    assert.equal(render().selected, "thread-2");
    assert.equal(render().submitting, false);
    assert.equal(render().detail.attachments.length, 0);
    assert.equal(render().resolveScopeId(targetScope), targetId);
    assert.equal(streams.has(targetId), true);
    assert.equal(streams.has("thread-2"), false);
    streams.get(targetId).complete();
    await sending;
    assert.equal(render().getDraft("thread-2"), "Second thread draft");
    assert.equal(render().message, "Second thread draft");
  });

test("a background draft sync failure does not replace the selected conversation error state", async () => {
  await mounted(["thread-1", "thread-2"]);
  let failSync;
  onRequest = (_url, body, method) => {
    if (method === "PATCH" && body.composerDraft !== undefined)
      return new Promise((_resolve, reject) => {
        failSync = () => reject(new Error("Draft sync failed"));
      });
  };
  render().draft("First thread draft");
  const saving = render().saveDraft("First thread draft", "thread-1");
  await setImmediate();
  await render().choose("thread-2");
  failSync();
  await assert.rejects(saving, /Draft sync failed/);
  assert.equal(render().selected, "thread-2");
  assert.equal(render().error, "");
  assert.equal(render().getDraft("thread-1"), "First thread draft");
});

test("history stays loading until a successful empty list resolves", async () => {
  let release;
  onRequest = (url, _body, method) =>
    url.endsWith("/threads?resourceId=post") && method === "GET"
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
    url.endsWith("/threads?resourceId=post") && method === "GET" ? Promise.reject(new Error("Offline")) : undefined;
  let hook = await mounted();
  assert.equal(hook.historyStatus, "error");
  assert.deepEqual(hook.threads, []);
  assert.deepEqual(state.toasts, []);
  let release;
  onRequest = (url, _body, method) =>
    url.endsWith("/threads?resourceId=post") && method === "GET"
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
    url.endsWith("/threads?resourceId=post") && method === "GET" ? Promise.reject(new Error("Offline")) : undefined;
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

for (const conversation of ["existing", "new"])
  test(`a successful ${conversation} conversation receives its full response through the stream without fetching history`, async () => {
    await mounted(conversation === "existing" ? ["thread-1"] : []);
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
      onEvent({ type: "text-delta", text: "A clearer" });
      onEvent({ type: "text-delta", text: " opening" });
      onEvent({ type: "completed", run: completed });
      return completed;
    };
    const callsBeforeSend = state.calls.length;
    const completed = await render().send({ ...request("Improve the opening"), attachmentIds: ["source"] });
    const hook = render();
    assert.equal(completed.status, "completed");
    assert.deepEqual(
      state.calls.slice(callsBeforeSend).filter((call) => call.method === "GET"),
      [],
    );
    assert.deepEqual(
      hook.detail.messages.map((message) => [message.id, message.role]),
      [
        ["user", "user"],
        ["assistant", "assistant"],
      ],
    );
    assert.deepEqual(hook.detail.messages[0].parts, [
      { type: "text", text: "Improve the opening" },
      { type: "attachment", attachmentId: "source" },
    ]);
    assert.deepEqual(hook.detail.messages[1].parts, [
      { type: "text", text: "A clearer opening" },
      { type: "proposal", proposal },
    ]);
    assert.deepEqual(hook.freshRunIds, ["run"]);
    assert.deepEqual(state.toasts, []);
  });

test("a delayed history snapshot cannot discard messages accepted and completed after the read began", async () => {
  await mounted(["thread-1"]);
  const oldDetail = structuredClone(serverDetails["thread-1"]);
  let releaseHistory;
  onRequest = (url, _body, method) =>
    url.endsWith("/thread-1") && method === "GET" && !releaseHistory
      ? new Promise((resolve) => {
          releaseHistory = resolve;
        })
      : undefined;
  const choosing = render().choose("thread-1");
  state.stream = async (input, _signal, onEvent) => {
    const completed = run(input, "completed", {
      inputMessageId: "user",
      assistantMessageId: "assistant",
      response: {
        text: "New response",
        proposals: [],
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
  const sending = render().send(request("New question"));
  await setImmediate();
  releaseHistory(oldDetail);
  await Promise.all([choosing, sending]);
  assert.deepEqual(
    render().detail.messages.map((message) => [message.id, message.parts[0].text]),
    [
      ["user", "New question"],
      ["assistant", "New response"],
    ],
  );
  assert.equal(render().detail.runs[0].status, "completed");
});

test("a completed proposal stays usable without relying on history transport", async () => {
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
  const callsBeforeSend = state.calls.length;
  const completed = await render().send(request("Improve the opening"));
  const hook = render();
  assert.equal(completed?.status, "completed");
  assert.deepEqual(hook.freshRunIds, ["run"]);
  assert.equal(hook.detail.messages.find((message) => message.id === "user").parts[0].text, "Improve the opening");
  assert.deepEqual(hook.detail.messages.find((message) => message.id === "assistant").parts, [
    { type: "text", text: "A clearer opening" },
    { type: "proposal", proposal },
  ]);
  assert.deepEqual(
    state.calls.slice(callsBeforeSend).filter((call) => call.method === "GET"),
    [],
  );
  assert.deepEqual(state.toasts, []);
});

test("agent completion uses the streamed execution without fetching history or inventing a chat message", async () => {
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
  const callsBeforeSend = state.calls.length;
  const result = await render().send(
    { operation: "agent", agentId: "auditor", message: "Review" },
    undefined,
    "thread-1",
    {
      executionMode: "standalone",
    },
  );
  assert.equal(result.status, "completed");
  assert.equal(render().detail.executions[0].artifact.attachmentId, "artifact");
  assert.equal(render().detail.executions[0].requestMessage, "Review");
  assert.deepEqual(render().detail.messages, []);
  assert.deepEqual(
    state.calls.slice(callsBeforeSend).filter((call) => call.method === "GET"),
    [],
  );
  assert.deepEqual(state.toasts, []);
});

for (const failureAt of ["second-link", "run-start"])
  test(`standalone ${failureAt} failure preserves its draft and prepared reference attachments`, async () => {
    await mounted(["thread-1"]);
    render().draft("Draft");
    render().composerState({ agentId: "auditor", attachmentIds: ["uploaded"], content: richComposerContent });
    let added = 0;
    onRequest = (url, _body, method) => {
      if (!url.endsWith("/attachments") || method !== "POST") return undefined;
      added++;
      if (failureAt === "second-link" && added === 2) return Promise.reject(new Error("Link unavailable"));
      return {
        attachment: { id: `link-${added}`, threadId: "thread-1", messageId: null, type: "link", label: "Source" },
      };
    };
    let submissions = 0;
    state.stream = async () => {
      submissions++;
      throw new Error("Run unavailable");
    };
    const result = await render().send(
      { operation: "agent", agentId: "auditor", message: "Draft", attachmentIds: ["uploaded"] },
      undefined,
      "thread-1",
      { executionMode: "standalone", referenceLinks: ["https://example.com/first", "https://example.com/second"] },
    );
    assert.equal(result, null);
    assert.equal(submissions, failureAt === "run-start" ? 1 : 0);
    assert.equal(render().message, "Draft");
    assert.deepEqual(render().composerSelection, {
      agentId: "auditor",
      attachmentIds: failureAt === "second-link" ? ["uploaded", "link-1"] : ["uploaded", "link-1", "link-2"],
      content: richComposerContent,
    });
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
  saved.set('assistant:["owner","fixture","post"]:selection:new', JSON.stringify(selection));
  saved.set('assistant:["owner","fixture","post"]:selection:thread-1', JSON.stringify(selection));
  await mounted(["thread-1"]);
  assert.deepEqual(render().composerSelection, selection);
  assert.deepEqual(render().composerSelectionsByThread.new, selection);
});

test("invalid local inline positions fall back without dropping agent or attachments", async () => {
  const selection = { agentId: "writer", attachmentIds: ["plan"] };
  saved.set('assistant:["owner","fixture","post"]:selection:new', JSON.stringify({ ...selection, agentOffset: -1 }));
  saved.set(
    'assistant:["owner","fixture","post"]:selection:thread-1',
    JSON.stringify({ ...selection, agentOffset: 8001 }),
  );
  await mounted(["thread-1"]);
  assert.deepEqual(render().composerSelection, selection);
  assert.deepEqual(render().composerSelectionsByThread.new, selection);
});

test("unsafe local rich content is omitted without dropping the agent selection", async () => {
  const selection = { agentId: "writer", agentOffset: 5, attachmentIds: ["plan"] };
  const content = { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/x" } }] };
  saved.set('assistant:["owner","fixture","post"]:selection:new', JSON.stringify({ ...selection, content }));
  saved.set('assistant:["owner","fixture","post"]:selection:thread-1', JSON.stringify({ ...selection, content }));
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
    resourceId: "post",
  };
  hook.updateRun(run(input, "failed", { operation: "agent", updatedAt: "2026-09-18T00:01:00Z" }));
  hook = render();
  const entry = hook.detail.executions[0];
  serverDetails["thread-1"].executions = [{ ...entry, status: "running", updatedAt: "2026-09-18T00:00:00Z" }];
  await hook.refresh();
  assert.equal(render().detail.executions[0].status, "failed");
});

test("changing owner or integration isolates draft, rich selection, settings, and outstanding detail reads", async () => {
  let hook = await mounted(["thread-1"]);
  hook.draft("Private fixture draft");
  hook.composerState({ agentId: "fixture-agent", attachmentIds: [] });
  let resolveOld;
  onRequest = (url) =>
    url.endsWith("/threads/thread-1")
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : undefined;
  const pending = hook.choose("thread-1");
  await setImmediate();
  const old = structuredClone(serverDetails["thread-1"]);
  onRequest = null;
  serverDetails["thread-1"].thread.title = "Other integration conversation";
  currentScope = ["second", "post", "other-owner"];
  render();
  await setImmediate();
  hook = render();
  assert.equal(hook.message, "");
  assert.equal(hook.composerSelection.agentId, undefined);
  resolveOld(old);
  await pending;
  hook = render();
  assert.equal(hook.detail.thread.title, "Other integration conversation");
  hook.draft("Independent draft");
  assert.equal(saved.get('assistant:["owner","fixture","post"]:draft:thread-1'), "Private fixture draft");
  assert.equal(saved.get('assistant:["other-owner","second","post"]:draft:thread-1'), "Independent draft");
});

test("old Blog cache entries are not restored into the shared Assistant", async () => {
  saved.set("blog-assistant:owner:post:draft:new", "Old Blog draft");
  saved.set("blog-assistant:owner:post:selection:new", JSON.stringify({ agentId: "writer", attachmentIds: ["old"] }));
  const hook = await mounted();
  assert.equal(hook.message, "");
  assert.equal(hook.composerSelection.agentId, undefined);
  assert.deepEqual(hook.composerSelection.attachmentIds, []);
  assert.equal(saved.has('assistant:["owner","fixture","post"]:draft:new'), false);
});

test("switching scope cancels old stream recovery without unlocking a new scope submission", async () => {
  await mounted(["thread-1"]);
  let rejectOld;
  state.stream = (_input, signal) =>
    new Promise((_resolve, reject) => {
      rejectOld = () => reject(new DOMException("Stopped", "AbortError"));
      assert.equal(signal.aborted, false);
    });
  const oldSend = render().send(request("Old private message"));
  await setImmediate();
  currentScope = ["second", "post", "other-owner"];
  render();
  await setImmediate();
  let completeNew;
  state.stream = (input) =>
    new Promise((resolve) => {
      completeNew = () => resolve(run(input, "failed"));
    });
  const newSend = render().send(request("Current message"));
  await setImmediate();
  const callsBeforeOldAbort = state.calls.length;
  rejectOld();
  await oldSend;
  assert.equal(render().submitting, true);
  assert.equal(await render().send(request("Duplicate current message")), undefined);
  assert.equal(
    state.calls.slice(callsBeforeOldAbort).some((call) => call.url.startsWith("/api/assistant/fixture/")),
    false,
  );
  assert.equal(render().error, "");
  completeNew();
  await newSend;
  assert.equal(render().submitting, false);
});

test("settings already in flight cannot overwrite another scope or dispatch its queued saves", async () => {
  await mounted(["thread-1"]);
  let finishSettings;
  onRequest = (url, _body, method) =>
    url.startsWith("/api/assistant/fixture/") && method === "PATCH"
      ? new Promise((resolve) => {
          finishSettings = resolve;
        })
      : undefined;
  const first = render().settings({ tone: "Old setting" });
  const queued = render().settings({ tone: "Queued old setting" });
  await setImmediate();
  currentScope = ["second", "post", "other-owner"];
  serverDetails["thread-1"].thread.settings = { priority: "Current setting" };
  render();
  await setImmediate();
  finishSettings({ thread: { ...thread("thread-1"), settings: { tone: "Old setting" } } });
  await Promise.all([first, queued]);
  assert.deepEqual(render().requestSettings, { priority: "Current setting" });
  assert.equal(state.calls.filter((call) => call.method === "PATCH").length, 1);
});
