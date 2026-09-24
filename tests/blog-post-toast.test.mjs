import { setImmediate } from "node:timers/promises";
import { expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ values: [], index: 0, calls: [], toasts: [], paths: [], response: null }));

// The original `node --test` run did not load .env, so APP_URL was unset and the
// real appHref() returned paths unchanged. vitest/Vite inlines APP_URL from .env
// (it can't be unset at runtime), so mock appHref as an identity to keep the
// asserted "/admin/blog?..." paths.
vi.mock("@/lib/routing/subdomains.ts", () => ({ appHref: (path) => path }));
globalThis.__blogToastTest = state;

vi.mock("react", async () => {
  const actual = await vi.importActual("react");
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
  function useEffect() {}
  function useRef(initial) {
    return useState({ current: initial })[0];
  }
  function useTransition() {
    return [false, (fn) => fn()];
  }
  return { ...actual, useState, useEffect, useRef, useTransition };
});
vi.mock("next/navigation", () => ({
  useRouter() {
    return {
      push(path) {
        state.paths.push(path);
      },
      refresh() {},
    };
  },
}));
vi.mock("@/components/ui/index.tsx", () => ({
  AlertBanner: "alert",
  AlertDialog: "dialog",
  AlertDialogContent: "content",
  AlertDialogHeader: "header",
  AlertDialogTitle: "title",
  AlertDialogDescription: "description",
  AlertDialogFooter: "footer",
  AlertDialogCancel: "cancel",
  Button: "button",
  Toaster: "toaster",
  toast: {
    success(title, options) {
      state.toasts.push({ title, ...options });
      return "toast-id";
    },
    dismiss() {},
  },
}));
vi.mock("@/app/admin/(protected)/blog/components/BlogPostList", () => ({ BlogPostList: "post-list" }));
vi.mock("@/app/admin/(protected)/blog/lib/useBlogTaxonomyOptions", () => ({
  useBlogTaxonomyOptions() {
    return { items: [] };
  },
}));
vi.mock("@/app/admin/(protected)/blog/actions", () => ({
  async mutateBlogAction(operation, payload) {
    state.calls.push({ operation, payload });
    if (state.response instanceof Error) throw state.response;
    return state.response;
  },
}));

const { BlogPosts } = await import("@/app/admin/(protected)/blog/components/BlogPosts.tsx");

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
  expect(state.calls).toEqual([{ operation: "trash", payload: { postId: "post-1", version: 3 } }]);
  const trashed = state.toasts.at(-1);
  expect(trashed.title).toBe("Post moved to trash");
  expect(trashed.action.label).toBe("Undo");
  expect(trashed.cancel.label).toBe("Open Trash");
  trashed.cancel.onClick();
  expect(state.paths).toEqual(["/admin/blog?status=trash"]);

  for (const failure of [{ ok: false, message: "Another editor changed this post." }, new Error("Offline")]) {
    state.response = failure;
    trashed.action.onClick();
    await setImmediate();
    expect(state.calls.at(-1)).toEqual({ operation: "restoreTrash", payload: { postId: "post-1", version: 4 } });
    const message =
      failure.message === "Offline"
        ? "Couldn’t restore the draft. Your content is still in Trash. Try again."
        : failure.message;
    expect(render().some((node) => node.props.variant === "error" && node.props.children === message)).toBeTruthy();
    expect(state.toasts.length).toBe(1);
  }

  state.response = { ok: true, data: { version: 5 } };
  trashed.action.onClick();
  await setImmediate();
  const restored = state.toasts.at(-1);
  expect(restored.title).toBe("Draft restored");
  expect(restored.action.label).toBe("Open draft");
  restored.action.onClick();
  expect(state.paths.at(-1)).toBe("/admin/blog/post-1");
});
