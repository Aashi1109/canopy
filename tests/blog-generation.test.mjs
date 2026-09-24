import { setImmediate } from "node:timers/promises";
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";

// appHref (real @/lib/routing/subdomains) rewrites /admin/* to the admin subdomain
// when APP_URL is a real host. Pin it to an IP so subdomain routing is disabled and
// appHref stays identity — the navigation paths this suite asserts on.
const savedAppUrl = process.env.APP_URL;
process.env.APP_URL = "http://127.0.0.1:3000";
const state = vi.hoisted(() => ({ slots: [], index: 0, effects: [], paths: [], toasts: [], calls: [] }));
globalThis.__generationTest = state;
const original = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
const storage = new Map();
const router = {
  push(path) {
    state.paths.push(path);
  },
};
state.router = router;

vi.mock("react", () => {
  function useState(initial) {
    const index = state.index++;
    if (!(index in state.slots)) state.slots[index] = initial;
    return [
      state.slots[index],
      (value) => {
        state.slots[index] = typeof value === "function" ? value(state.slots[index]) : value;
      },
    ];
  }
  function useRef(initial) {
    return useState({ current: initial })[0];
  }
  function useEffect(effect, deps) {
    const index = state.index++;
    const prior = state.slots[index];
    if (!prior || !deps || deps.some((value, i) => !Object.is(value, prior.deps[i]))) {
      state.effects.push(() => {
        prior?.cleanup?.();
        state.slots[index] = { deps, cleanup: effect() };
      });
    }
  }
  return { useState, useRef, useEffect };
});
vi.mock("next/navigation", () => ({ useRouter: () => state.router }));
vi.mock("lucide-react", () => ({ ChevronDown: "icon", Sparkles: "icon" }));
vi.mock("@/components/ui/index.tsx", () => ({
  Button: "button",
  H1: "h1",
  Input: "input",
  Label: "label",
  Select: "select",
  Textarea: "textarea",
  toast: {
    error(message) {
      state.toasts.push(message);
    },
  },
}));
vi.mock("@/app/admin/(protected)/blog/components/BlogGenerationProgress", () => ({
  BlogGenerationProgress: "progress",
}));

const { BlogGenerationForm } = await import("@/app/admin/(protected)/blog/components/BlogGenerationForm.tsx");
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

beforeEach(() => {
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
afterEach(cleanup);
afterAll(() => {
  if (savedAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = savedAppUrl;
  delete globalThis.__generationTest;
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

test("availability retry rechecks the service without submitting a generation", async () => {
  handler = () => response({ error: "Temporarily unavailable" }, 503);
  let view = await settle();
  expect(state.report.enabled).toBe(false);
  handler = () => response(available);
  view.button("Check availability").props.onClick();
  view = await settle();
  expect(state.report.enabled).toBe(true);
  expect(posts().length).toBe(0);
  expect(view.button("Generate blog").props.disabled).toBe(false);
});

test("definite validation rejection permits an edited request with a new id", async () => {
  await settle();
  typeIdea("Initial idea");
  handler = () => response({ error: "Describe a more specific idea" }, 400);
  let view = await submit();
  expect(view.field("blog-ai-idea").props["aria-invalid"]).toBe(true);
  expect(storage.has("assistant-generation:blog:user-a:v1:request")).toBe(false);
  expect(state.report.busy).toBe(false);
  typeIdea("Corrected idea");
  handler = (call) => stream(run(call.body));
  await submit();
  expect(posts()[1].body.message).toBe("Corrected idea");
  expect(posts()[0].body.clientRequestId).not.toBe(posts()[1].body.clientRequestId);
});

test("ambiguous network failure preserves and retries exactly the same submission", async () => {
  await settle();
  typeIdea("An idea worth keeping");
  handler = () => {
    throw new TypeError("Network interrupted");
  };
  let view = await submit();
  const saved = JSON.parse(storage.get("assistant-generation:blog:user-a:v1:request"));
  expect(state.report.busy).toBe(true);
  expect(view.nodes.find((node) => node.type === "fieldset").props.disabled).toBe(true);
  handler = (call) => stream(run(call.body));
  view.button("Check submission").props.onClick();
  await settle();
  expect(posts().map((call) => call.body)).toEqual([saved, saved]);
  expect(state.report.busy).toBe(false);
  expect(storage.has("assistant-generation:blog:user-a:v1:request")).toBe(false);
});

test("reload offers an explicit status check without normalizing or replaying the pending request", async () => {
  storage.set("assistant-generation:blog:user-a:v1:request", JSON.stringify(request));
  let view = await settle();
  expect(posts().length).toBe(0);
  expect(view.field("blog-ai-idea").props.value).toBe(request.message);
  view.button("Check submission").props.onClick();
  await settle();
  expect(posts()[0].body).toEqual(request);
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
  expect(view.field("blog-ai-idea").props.value).toBe("");
  expect(storage.has("blog-generation-brief")).toBe(false);
  expect(storage.has("blog-generation-request")).toBe(false);
  expect(storage.has("blog-generation:user-a:brief")).toBe(false);
  expect(storage.has("blog-generation:user-a:request")).toBe(false);
  cleanup();
  userId = "user-a";
  view = await settle();
  expect(view.field("blog-ai-idea").props.value).toBe("Private idea for user A");
  expect(posts().length).toBe(0);
});

test("a completed resume URL opens the saved draft for review once without generating again", async () => {
  location("?run=completed-run");
  handler = (call) =>
    call.url === "/api/assistant/blog/config"
      ? response(available)
      : response({ run: { ...run(request, "completed"), resourceId: "draft-1", threadId: "thread-1" } });
  const view = await settle();
  expect(view.progress.props.brief).toBe(request.message);
  expect(state.paths).toEqual(["/admin/blog/draft-1?review=1&thread=thread-1"]);
  expect(posts().length).toBe(0);
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
  expect(view.progress.props.streaming).toBe(true);
  handler = () => response({ run: run(submitted, "cancelled") });
  view.progress.props.onCancel();
  view = await settle();
  expect(posts().length).toBe(1);
  view.progress.props.onRefresh();
  view = await settle();
  expect(view.progress.props.brief).toBe(submitted.message);
  expect(state.report.busy).toBe(false);
  expect(state.paths).toEqual([]);
  handler = (call) => stream(run(call.body));
  view.progress.props.onRetry();
  await settle();
  expect(posts()[1].body.clientRequestId).not.toBe(submitted.clientRequestId);
  expect(posts()[1].body.resourceId).toBe("draft-1");
  expect(posts()[1].body.threadId).toBe("thread-1");
  expect(posts()[1].body.inputMessageId).toBe("message-1");
  expect(posts()[1].body.message).toBe(submitted.message);
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
  expect(view.progress.props.refreshing).toBe(true);
  expect(state.calls.length).toBe(before + 1);
  expect(posts().length).toBe(0);
  finish(response({ run: run(request, "failed") }));
  view = await settle();
  expect(view.progress.props.refreshing).toBe(false);
});

test("old Blog request shapes are not recovered from Assistant storage", async () => {
  const { schemaVersion, ...oldRequest } = request;
  storage.set("assistant-generation:blog:user-a:v1:request", JSON.stringify({ ...oldRequest, postId: "old-post" }));
  const view = await settle();
  expect(view.field("blog-ai-idea").props.value).toBe("");
  expect(state.report.busy).toBe(false);
  expect(posts().length).toBe(0);
  expect(storage.has("assistant-generation:blog:user-a:v1:request")).toBe(false);
});
