import { setImmediate } from "node:timers/promises";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  values: [],
  index: 0,
  calls: [],
  paths: [],
  toasts: [],
  cleanups: [],
  response: null,
}));
const originalWindow = globalThis.window;
globalThis.window = { location: { search: "" } };
// APP_URL without subdomains so appHref stays a passthrough (matches the asserted /admin/... paths).
const originalAppUrl = process.env.APP_URL;
process.env.APP_URL = "http://127.0.0.1:3000";
afterAll(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
});

vi.mock("react", () => {
  function useState(initial) {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = initial;
    return [
      state.values[index],
      (value) => {
        state.values[index] = value;
      },
    ];
  }
  function useRef(initial) {
    return useState({ current: initial })[0];
  }
  function useEffect(effect) {
    const index = state.index++;
    if (!(index in state.values)) {
      state.values[index] = true;
      state.cleanups.push(effect());
    }
  }
  return { useState, useRef, useEffect };
});
vi.mock("next/navigation", () => ({
  useRouter() {
    return {
      push(path) {
        state.paths.push(path);
      },
    };
  },
}));
vi.mock("next/link", () => ({ default: "link" }));
vi.mock("@/components/ui/index.tsx", () => ({
  BackButton: "back-button",
  Button: "button",
  Label: "label",
  Textarea: "textarea",
  Toaster: "toaster",
  toast: {
    error(message) {
      state.toasts.push(message);
    },
  },
}));
vi.mock("@/app/admin/(protected)/blog/components/BlogEditor.module.css", () => ({ default: {} }));
vi.mock("@/app/admin/(protected)/blog/components/BlogGenerationForm", () => ({
  BlogGenerationForm: "generation-form",
}));
vi.mock("@/app/admin/(protected)/blog/actions", () => ({
  async mutateBlogAction(operation, payload) {
    state.calls.push({ operation, payload });
    if (state.response instanceof Error) throw state.response;
    return state.response;
  },
}));

const { NewBlogPost } = await import("@/app/admin/(protected)/blog/components/NewBlogPost.tsx");

beforeEach(() => {
  Object.assign(state, {
    values: [],
    index: 0,
    calls: [],
    paths: [],
    toasts: [],
    cleanups: [],
    response: { ok: true, data: { id: "draft-1" } },
  });
});

function walk(node) {
  return Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
}

function visibleText(node) {
  if (Array.isArray(node)) return node.map(visibleText).join("");
  return node?.props
    ? visibleText(node.props.children)
    : typeof node === "string" || typeof node === "number"
      ? String(node)
      : "";
}

function render() {
  state.index = 0;
  const nodes = walk(NewBlogPost({ userId: "test-user" }));
  return {
    nodes,
    input: nodes.find((node) => node.type === "textarea"),
    form: nodes.find((node) => node.type === "form"),
  };
}

function enter(view, overrides = {}) {
  let prevented = false;
  view.input.props.onKeyDown({
    key: "Enter",
    repeat: false,
    nativeEvent: { isComposing: false, keyCode: 13 },
    preventDefault() {
      prevented = true;
    },
    currentTarget: {
      form: {
        requestSubmit() {
          view.form.props.onSubmit({ preventDefault() {} });
        },
      },
    },
    ...overrides,
  });
  return prevented;
}

function typeTitle(title) {
  render().input.props.onChange({ target: { value: title } });
  return render();
}

test("Enter creates a trimmed title once and keeps input read-only through client navigation", async () => {
  let resolve;
  state.response = new Promise((done) => {
    resolve = done;
  });
  const view = typeTitle("  My story  ");
  expect(enter(view)).toBe(true);
  enter(view);
  view.form.props.onSubmit({ preventDefault() {} });
  expect(state.calls).toEqual([{ operation: "create", payload: { title: "My story" } }]);
  expect(render().input.props.readOnly).toBe(true);
  expect(state.paths).toEqual([]);
  resolve({ ok: true, data: { id: "draft-1" } });
  await setImmediate();
  expect(state.paths).toEqual(["/admin/blog/draft-1"]);
  expect(render().input.props.readOnly).toBe(true);
});

test("blank titles, composition, held Enter, and other keys do not create drafts", async () => {
  enter(typeTitle("   "));
  expect(state.toasts.length).toBe(1);
  expect(state.toasts[0]).toMatch(/title/i);
  const view = typeTitle("My story");
  for (const event of [
    { nativeEvent: { isComposing: true, keyCode: 13 } },
    { nativeEvent: { isComposing: false, keyCode: 229 } },
    { repeat: true },
    { key: "a" },
  ]) {
    enter(view, event);
  }
  await setImmediate();
  expect(state.calls).toEqual([]);
  expect(state.toasts.length).toBe(1);
  expect(render().input.props.readOnly).toBe(false);
});

test("20 words separated by varied whitespace are accepted", async () => {
  const title = `  ${Array.from({ length: 20 }, (_, index) => `w${index}`).join(" \t\n ")}  `;
  enter(typeTitle(title));
  await setImmediate();
  expect(state.calls).toEqual([{ operation: "create", payload: { title: title.trim() } }]);
  expect(state.paths).toEqual(["/admin/blog/draft-1"]);
});

test("21 words prevent creation and show a recoverable title limit error", async () => {
  const title = Array.from({ length: 21 }, () => "word").join(" ");
  enter(typeTitle(title));
  await setImmediate();
  const view = render();
  expect(state.calls).toEqual([]);
  expect(view.input.props.value).toBe(title);
  expect(view.input.props.readOnly).toBe(false);
  expect(view.input.props["aria-invalid"]).toBe(true);
  expect(view.nodes.some((node) => /20\s+words/i.test(visibleText(node)))).toBeTruthy();
  expect(state.toasts.length).toBe(1);
  expect(state.toasts[0]).toMatch(/20\s+words/i);
  enter(typeTitle("A shorter title"));
  await setImmediate();
  expect(state.calls.length).toBe(1);
  expect(state.paths).toEqual(["/admin/blog/draft-1"]);
});

for (const failure of [{ ok: false, message: "Title is already in use." }, new Error("Offline")]) {
  test(`creation failure preserves title and permits Enter retry: ${failure.message}`, async () => {
    state.response = failure;
    enter(typeTitle("My story"));
    await setImmediate();
    const view = render();
    expect(view.input.props.value).toBe("My story");
    expect(view.input.props.readOnly).toBe(false);
    expect(state.paths).toEqual([]);
    expect(state.toasts.length).toBe(1);
    if (!(failure instanceof Error)) expect(state.toasts[0]).toBe(failure.message);
    else expect(state.toasts[0]).toMatch(/try again/i);
    state.response = { ok: true, data: { id: "draft-2" } };
    enter(view);
    await setImmediate();
    expect(state.calls.length).toBe(2);
    expect(state.paths).toEqual(["/admin/blog/draft-2"]);
  });
}

test("a pending creation cannot navigate after leaving the form", async () => {
  let resolve;
  state.response = new Promise((done) => {
    resolve = done;
  });
  enter(typeTitle("My story"));
  expect(state.calls.length).toBe(1);
  for (const cleanup of state.cleanups) cleanup?.();
  resolve({ ok: true, data: { id: "draft-1" } });
  await setImmediate();
  expect(state.paths).toEqual([]);
  expect(state.toasts).toEqual([]);
});
