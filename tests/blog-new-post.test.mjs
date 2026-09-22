import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { transformSync } from "next/dist/build/swc/index.js";

const state = { values: [], index: 0, calls: [], paths: [], toasts: [], cleanups: [], response: null };
globalThis.__newBlogPostTest = state;
const originalWindow = globalThis.window;
globalThis.window = { location: { search: "" } };
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/routing/subdomains.ts")
      return { shortCircuit: true, url: new URL("../lib/routing/subdomains.ts", import.meta.url).href };
    if (!context.parentURL?.endsWith("/NewBlogPost.tsx")) return next(specifier, context);
    if (specifier === "react")
      return stub(`
        const state = globalThis.__newBlogPostTest;
        export function useState(initial) {
          const index = state.index++;
          if (!(index in state.values)) state.values[index] = initial;
          return [state.values[index], value => { state.values[index] = value; }];
        }
        export function useRef(initial) { return useState({ current: initial })[0]; }
        export function useEffect(effect) {
          const index = state.index++;
          if (!(index in state.values)) {
            state.values[index] = true;
            state.cleanups.push(effect());
          }
        }
      `);
    if (specifier === "next/navigation")
      return stub(`export function useRouter() {
        return { push(path) { globalThis.__newBlogPostTest.paths.push(path); } };
      }`);
    if (specifier === "next/link") return stub("export default 'link';");
    if (specifier === "@/components/ui/index.tsx")
      return stub(`
        export const BackButton = 'back-button', Button = 'button', Label = 'label', Textarea = 'textarea', Toaster = 'toaster';
        export const toast = { error(message) { globalThis.__newBlogPostTest.toasts.push(message); } };
      `);
    if (specifier === "./BlogEditor.module.css") return stub("export default {};");
    if (specifier === "./BlogGenerationForm") return stub("export const BlogGenerationForm = 'generation-form';");
    if (specifier === "@/lib/blog/utils")
      return { shortCircuit: true, url: new URL("../lib/blog/utils.ts", import.meta.url).href };
    if (specifier === "../actions")
      return stub(`export async function mutateBlogAction(operation, payload) {
        const state = globalThis.__newBlogPostTest;
        state.calls.push({ operation, payload });
        if (state.response instanceof Error) throw state.response;
        return state.response;
      }`);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith("/NewBlogPost.tsx")) return next(url, context);
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
const { NewBlogPost } = await import("../app/admin/(protected)/blog/components/NewBlogPost.tsx");
test.after(() => {
  hooks.deregister();
  delete globalThis.__newBlogPostTest;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});
test.beforeEach(() => {
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
  assert.equal(enter(view), true);
  enter(view);
  view.form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(state.calls, [{ operation: "create", payload: { title: "My story" } }]);
  assert.equal(render().input.props.readOnly, true);
  assert.deepEqual(state.paths, []);
  resolve({ ok: true, data: { id: "draft-1" } });
  await setImmediate();
  assert.deepEqual(state.paths, ["/admin/blog/draft-1"]);
  assert.equal(render().input.props.readOnly, true);
});

test("blank titles, composition, held Enter, and other keys do not create drafts", async () => {
  enter(typeTitle("   "));
  assert.equal(state.toasts.length, 1);
  assert.match(state.toasts[0], /title/i);
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
  assert.deepEqual(state.calls, []);
  assert.equal(state.toasts.length, 1);
  assert.equal(render().input.props.readOnly, false);
});

test("20 words separated by varied whitespace are accepted", async () => {
  const title = `  ${Array.from({ length: 20 }, (_, index) => `w${index}`).join(" \t\n ")}  `;
  enter(typeTitle(title));
  await setImmediate();
  assert.deepEqual(state.calls, [{ operation: "create", payload: { title: title.trim() } }]);
  assert.deepEqual(state.paths, ["/admin/blog/draft-1"]);
});

test("21 words prevent creation and show a recoverable title limit error", async () => {
  const title = Array.from({ length: 21 }, () => "word").join(" ");
  enter(typeTitle(title));
  await setImmediate();
  const view = render();
  assert.deepEqual(state.calls, []);
  assert.equal(view.input.props.value, title);
  assert.equal(view.input.props.readOnly, false);
  assert.equal(view.input.props["aria-invalid"], true);
  assert.ok(view.nodes.some((node) => /20\s+words/i.test(visibleText(node))));
  assert.equal(state.toasts.length, 1);
  assert.match(state.toasts[0], /20\s+words/i);
  enter(typeTitle("A shorter title"));
  await setImmediate();
  assert.equal(state.calls.length, 1);
  assert.deepEqual(state.paths, ["/admin/blog/draft-1"]);
});

for (const failure of [{ ok: false, message: "Title is already in use." }, new Error("Offline")]) {
  test(`creation failure preserves title and permits Enter retry: ${failure.message}`, async () => {
    state.response = failure;
    enter(typeTitle("My story"));
    await setImmediate();
    const view = render();
    assert.equal(view.input.props.value, "My story");
    assert.equal(view.input.props.readOnly, false);
    assert.deepEqual(state.paths, []);
    assert.equal(state.toasts.length, 1);
    if (!(failure instanceof Error)) assert.equal(state.toasts[0], failure.message);
    else assert.match(state.toasts[0], /try again/i);
    state.response = { ok: true, data: { id: "draft-2" } };
    enter(view);
    await setImmediate();
    assert.equal(state.calls.length, 2);
    assert.deepEqual(state.paths, ["/admin/blog/draft-2"]);
  });
}

test("a pending creation cannot navigate after leaving the form", async () => {
  let resolve;
  state.response = new Promise((done) => {
    resolve = done;
  });
  enter(typeTitle("My story"));
  assert.equal(state.calls.length, 1);
  for (const cleanup of state.cleanups) cleanup?.();
  resolve({ ok: true, data: { id: "draft-1" } });
  await setImmediate();
  assert.deepEqual(state.paths, []);
  assert.deepEqual(state.toasts, []);
});
