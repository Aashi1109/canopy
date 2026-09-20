import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { transformSync } from "next/dist/build/swc/index.js";

const state = { slots: [], index: 0, effects: [], paths: [], toasts: [], calls: [] };
globalThis.__generationTest = state;
const original = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
const storage = new Map();
const router = {
  push(path) {
    state.paths.push(path);
  },
};
state.router = router;
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/assistant/client")
      return next(new URL("../lib/assistant/client.ts", import.meta.url).href, context);
    if (!context.parentURL?.endsWith("/BlogGenerationForm.tsx")) return next(specifier, context);
    if (specifier === "react")
      return stub(`
      const state = globalThis.__generationTest;
      export function useState(initial) {
        const index = state.index++;
        if (!(index in state.slots)) state.slots[index] = initial;
        return [state.slots[index], value => { state.slots[index] = typeof value === 'function' ? value(state.slots[index]) : value; }];
      }
      export function useRef(initial) { return useState({current: initial})[0]; }
      export function useEffect(effect, deps) {
        const index = state.index++;
        const prior = state.slots[index];
        if (!prior || !deps || deps.some((value, i) => !Object.is(value, prior.deps[i]))) {
          state.effects.push(() => {
            prior?.cleanup?.();
            state.slots[index] = {deps, cleanup: effect()};
          });
        }
      }
    `);
    if (specifier === "./BlogGenerationProgress") return stub('export const BlogGenerationProgress="progress";');
    if (specifier === "next/navigation")
      return stub("export function useRouter() { return globalThis.__generationTest.router; }");
    if (specifier === "lucide-react") return stub("export const ChevronDown='icon', Sparkles='icon';");
    if (specifier === "@/components/ui/index.tsx")
      return stub(`
      export const Button='button', H1='h1', Input='input', Label='label', Select='select', Textarea='textarea';
      export const toast={error(message){globalThis.__generationTest.toasts.push(message)}};
    `);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith("/BlogGenerationForm.tsx") && !url.endsWith("/client.ts")) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: transformSync(readFileSync(new URL(url), "utf8"), {
        filename: new URL(url).pathname,
        jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } },
        module: { type: "es6" },
      }).code,
    };
  },
});
const { BlogGenerationForm } = await import("../app/admin/(protected)/blog/components/BlogGenerationForm.tsx");
let userId = "user-a";
let handler;
const available = { enabled: true, provider: "openai", capabilities: {} };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const stream = (value) =>
  new Response(
    [
      { type: "run", run: value },
      { type: "completed", run: value },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n") + "\n",
  );
const request = {
  schemaVersion: 1,
  operation: "generate",
  clientRequestId: "previous-id",
  message: "A saved idea",
  settings: { tone: "Professional" },
};
const run = (input = request, status = "cancelled") => ({
  id: "run-1",
  integrationKey: "blog",
  executionMode: "conversational",
  operation: "generate",
  status,
  request: input,
  resourceId: "draft-1",
  threadId: "thread-1",
  inputMessageId: "message-1",
  errorMessage: null,
});
function cleanup() {
  for (const slot of state.slots) slot?.cleanup?.();
  state.slots = [];
  state.effects = [];
}
function location(search = "") {
  globalThis.window = {
    location: { href: `http://localhost/admin/blog/new${search}`, search },
    addEventListener() {},
    removeEventListener() {},
    history: {
      replaceState(_state, _title, url) {
        window.location.href = String(url);
        window.location.search = new URL(url).search;
      },
    },
  };
}
function walk(node) {
  return Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
}
function text(node) {
  return Array.isArray(node)
    ? node.map(text).join("")
    : node?.props
      ? text(node.props.children)
      : typeof node === "string"
        ? node
        : "";
}
const onState = (value) => {
  state.report = value;
};
function render() {
  state.index = 0;
  const nodes = walk(BlogGenerationForm({ hidden: false, userId, onState }));
  for (const effect of state.effects.splice(0)) effect();
  return {
    nodes,
    field(id) {
      return nodes.find((node) => node.props.id === id);
    },
    button(label) {
      return nodes.find((node) => node.type === "button" && text(node) === label);
    },
    form: nodes.find((node) => node.type === "form"),
    progress: nodes.find((node) => node.type === "progress"),
  };
}
async function settle() {
  for (let i = 0; i < 5; i++) {
    render();
    await setImmediate();
  }
  return render();
}
function typeIdea(value) {
  render().field("blog-ai-idea").props.onChange({ target: { value } });
}
async function submit() {
  render().form.props.onSubmit({ preventDefault() {} });
  return settle();
}
const posts = () => state.calls.filter((call) => call.method === "POST");

test.beforeEach(() => {
  cleanup();
  storage.clear();
  userId = "user-a";
  Object.assign(state, { index: 0, paths: [], toasts: [], calls: [] });
  location();
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  handler = (call) => (call.url === "/api/assistant/blog/config" ? response(available) : stream(run(call.body)));
  globalThis.fetch = async (url, options) => {
    const call = { url, method: options.method, body: options.body ? JSON.parse(options.body) : undefined };
    state.calls.push(call);
    return handler(call);
  };
});
test.afterEach(cleanup);
test.after(() => {
  hooks.deregister();
  delete globalThis.__generationTest;
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

test("availability retry rechecks the service without submitting a generation", async () => {
  handler = () => response({ error: "Temporarily unavailable" }, 503);
  let view = await settle();
  assert.equal(state.report.enabled, false);
  handler = () => response(available);
  view.button("Check availability").props.onClick();
  view = await settle();
  assert.equal(state.report.enabled, true);
  assert.equal(posts().length, 0);
  assert.equal(view.button("Generate blog").props.disabled, false);
});

test("definite validation rejection permits an edited request with a new id", async () => {
  await settle();
  typeIdea("Initial idea");
  handler = () => response({ error: "Describe a more specific idea" }, 400);
  let view = await submit();
  assert.equal(view.field("blog-ai-idea").props["aria-invalid"], true);
  assert.equal(storage.has("assistant-generation:blog:user-a:v1:request"), false);
  assert.equal(state.report.busy, false);
  typeIdea("Corrected idea");
  handler = (call) => stream(run(call.body));
  await submit();
  assert.equal(posts()[1].body.message, "Corrected idea");
  assert.notEqual(posts()[0].body.clientRequestId, posts()[1].body.clientRequestId);
});

test("ambiguous network failure preserves and retries exactly the same submission", async () => {
  await settle();
  typeIdea("An idea worth keeping");
  handler = () => {
    throw new TypeError("Network interrupted");
  };
  let view = await submit();
  const saved = JSON.parse(storage.get("assistant-generation:blog:user-a:v1:request"));
  assert.equal(state.report.busy, true);
  assert.equal(view.nodes.find((node) => node.type === "fieldset").props.disabled, true);
  handler = (call) => stream(run(call.body));
  view.button("Check submission").props.onClick();
  await settle();
  assert.deepEqual(
    posts().map((call) => call.body),
    [saved, saved],
  );
  assert.equal(state.report.busy, false);
  assert.equal(storage.has("assistant-generation:blog:user-a:v1:request"), false);
});

test("reload offers an explicit status check without normalizing or replaying the pending request", async () => {
  storage.set("assistant-generation:blog:user-a:v1:request", JSON.stringify(request));
  let view = await settle();
  assert.equal(posts().length, 0);
  assert.equal(view.field("blog-ai-idea").props.value, request.message);
  view.button("Check submission").props.onClick();
  await settle();
  assert.deepEqual(posts()[0].body, request);
});

test("briefs are scoped to the authenticated user and retired Blog storage is discarded", async () => {
  storage.set("blog-generation-brief", JSON.stringify({ idea: "Someone else's legacy text" }));
  storage.set("blog-generation-request", JSON.stringify(request));
  storage.set("blog-generation:user-a:brief", JSON.stringify({ idea: "Old Blog brief" }));
  storage.set("blog-generation:user-a:request", JSON.stringify({ ...request, postId: "old-post" }));
  await settle();
  typeIdea("Private idea for user A");
  await settle();
  cleanup();
  userId = "user-b";
  let view = await settle();
  assert.equal(view.field("blog-ai-idea").props.value, "");
  assert.equal(storage.has("blog-generation-brief"), false);
  assert.equal(storage.has("blog-generation-request"), false);
  assert.equal(storage.has("blog-generation:user-a:brief"), false);
  assert.equal(storage.has("blog-generation:user-a:request"), false);
  cleanup();
  userId = "user-a";
  view = await settle();
  assert.equal(view.field("blog-ai-idea").props.value, "Private idea for user A");
  assert.equal(posts().length, 0);
});

test("a completed resume URL opens the saved draft for review once without generating again", async () => {
  location("?run=completed-run");
  handler = (call) =>
    call.url === "/api/assistant/blog/config"
      ? response(available)
      : response({ run: { ...run(request, "completed"), resourceId: "draft-1", threadId: "thread-1" } });
  const view = await settle();
  assert.equal(view.progress.props.brief, request.message);
  assert.deepEqual(state.paths, ["/admin/blog/draft-1?review=1&thread=thread-1"]);
  assert.equal(posts().length, 0);
});

test("cancelling releases the stream and retry reuses the same draft without late navigation", async () => {
  await settle();
  typeIdea("An idea to resume later");
  handler = (call) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(JSON.stringify({ type: "run", run: run(call.body, "running") }) + "\n"),
          );
        },
      }),
    );
  let view = await submit();
  const submitted = posts()[0].body;
  assert.equal(view.progress.props.streaming, true);
  handler = () => response({ run: run(submitted, "cancelled") });
  view.progress.props.onCancel();
  view = await settle();
  assert.equal(posts().length, 1);
  view.progress.props.onRefresh();
  view = await settle();
  assert.equal(view.progress.props.brief, submitted.message);
  assert.equal(state.report.busy, false);
  assert.deepEqual(state.paths, []);
  handler = (call) => stream(run(call.body));
  view.progress.props.onRetry();
  await settle();
  assert.notEqual(posts()[1].body.clientRequestId, submitted.clientRequestId);
  assert.equal(posts()[1].body.resourceId, "draft-1");
  assert.equal(posts()[1].body.threadId, "thread-1");
  assert.equal(posts()[1].body.inputMessageId, "message-1");
  assert.equal(posts()[1].body.message, submitted.message);
});

test("manual status refresh disables repeated reads and never submits another generation", async () => {
  location("?run=unconfirmed-run");
  handler = (call) =>
    call.url === "/api/assistant/blog/config" ? response(available) : response({ run: run(request, "unknown") });
  let view = await settle();
  let finish;
  handler = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const before = state.calls.length;
  view.progress.props.onRefresh();
  view.progress.props.onRefresh();
  view = await settle();
  assert.equal(view.progress.props.refreshing, true);
  assert.equal(state.calls.length, before + 1);
  assert.equal(posts().length, 0);
  finish(response({ run: run(request, "failed") }));
  view = await settle();
  assert.equal(view.progress.props.refreshing, false);
});

test("old Blog request shapes are not recovered from Assistant storage", async () => {
  const { schemaVersion, ...oldRequest } = request;
  storage.set("assistant-generation:blog:user-a:v1:request", JSON.stringify({ ...oldRequest, postId: "old-post" }));
  const view = await settle();
  assert.equal(view.field("blog-ai-idea").props.value, "");
  assert.equal(state.report.busy, false);
  assert.equal(posts().length, 0);
  assert.equal(storage.has("assistant-generation:blog:user-a:v1:request"), false);
});
