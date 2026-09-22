import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { transformSync } from "next/dist/build/swc/index.js";

const state = { values: [], index: 0, calls: [], toasts: [], paths: [], response: null };
globalThis.__blogToastTest = state;
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/routing/subdomains.ts")
      return { shortCircuit: true, url: new URL("../lib/routing/subdomains.ts", import.meta.url).href };
    if (!context.parentURL?.endsWith("/BlogPosts.tsx")) return next(specifier, context);
    if (specifier === "react")
      return stub(`
        const state = globalThis.__blogToastTest;
        export function useState(initial) {
          const index = state.index++;
          if (!(index in state.values)) state.values[index] = initial;
          return [state.values[index], value => { state.values[index] = value; }];
        }
        export function useEffect() {}
        export function useRef(initial) { return useState({ current: initial })[0]; }
        export function useTransition() { return [false, fn => fn()]; }
      `);
    if (specifier === "next/navigation")
      return stub(`export function useRouter() {
        return { push(path) { globalThis.__blogToastTest.paths.push(path); }, refresh() {} };
      }`);
    if (specifier === "@/components/ui/index.tsx")
      return stub(`
        export const AlertBanner = 'alert', AlertDialog = 'dialog', AlertDialogContent = 'content',
          AlertDialogHeader = 'header', AlertDialogTitle = 'title', AlertDialogDescription = 'description',
          AlertDialogFooter = 'footer', AlertDialogCancel = 'cancel', Button = 'button', Toaster = 'toaster';
        export const toast = {
          success(title, options) { globalThis.__blogToastTest.toasts.push({ title, ...options }); return 'toast-id'; },
          dismiss() {}
        };
      `);
    if (specifier === "./BlogPostList") return stub("export const BlogPostList = 'post-list';");
    if (specifier === "../lib/useBlogTaxonomyOptions")
      return stub("export function useBlogTaxonomyOptions() { return { items: [] }; }");
    if (specifier === "../actions")
      return stub(`export async function mutateBlogAction(operation, payload) {
        const state = globalThis.__blogToastTest;
        state.calls.push({ operation, payload });
        if (state.response instanceof Error) throw state.response;
        return state.response;
      }`);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith("/BlogPosts.tsx")) return next(url, context);
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
const { BlogPosts } = await import("../app/admin/(protected)/blog/components/BlogPosts.tsx");
test.after(() => {
  hooks.deregister();
  delete globalThis.__blogToastTest;
});

function walk(node) {
  return Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
}

function render() {
  state.index = 0;
  return walk(
    BlogPosts({
      posts: [{ id: "post-1", title: "A draft", version: 3, updatedAt: new Date("2026-09-18T00:00:00Z") }],
      categories: { items: [], nextCursor: null },
      filters: {},
      pagination: { page: 1, pageCount: 1, total: 1 },
      canCreate: false,
      canArchive: true,
      canManageTerms: false,
    }),
  );
}

test("trash toast retains navigation and Undo restores the returned version with recoverable failures", async () => {
  const list = render().find((node) => node.type === "post-list");
  list.props.onTrash(list.props.posts[0]);
  state.response = { ok: true, data: { version: 4 } };
  render()
    .find((node) => node.props.children === "Move to trash")
    .props.onClick();
  await setImmediate();
  assert.deepEqual(state.calls, [{ operation: "trash", payload: { postId: "post-1", version: 3 } }]);
  const trashed = state.toasts.at(-1);
  assert.equal(trashed.title, "Post moved to trash");
  assert.equal(trashed.action.label, "Undo");
  assert.equal(trashed.cancel.label, "Open Trash");
  trashed.cancel.onClick();
  assert.deepEqual(state.paths, ["/admin/blog?status=trash"]);

  for (const failure of [{ ok: false, message: "Another editor changed this post." }, new Error("Offline")]) {
    state.response = failure;
    trashed.action.onClick();
    await setImmediate();
    assert.deepEqual(state.calls.at(-1), { operation: "restoreTrash", payload: { postId: "post-1", version: 4 } });
    const message =
      failure.message === "Offline"
        ? "Couldn’t restore the draft. Your content is still in Trash. Try again."
        : failure.message;
    assert.ok(render().some((node) => node.props.variant === "error" && node.props.children === message));
    assert.equal(state.toasts.length, 1);
  }

  state.response = { ok: true, data: { version: 5 } };
  trashed.action.onClick();
  await setImmediate();
  const restored = state.toasts.at(-1);
  assert.equal(restored.title, "Draft restored");
  assert.equal(restored.action.label, "Open draft");
  restored.action.onClick();
  assert.equal(state.paths.at(-1), "/admin/blog/post-1");
});
