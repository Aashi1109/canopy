import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: [], denied: false, result: null }));
globalThis.__blogPreviewTest = state;

vi.mock("next/navigation", () => ({
  notFound() {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/admin/access", () => ({
  async requirePagePermission(...args) {
    state.calls.push(["permission", ...args]);
    if (state.denied) throw new Error("DENIED");
    return { user: { id: "admin" } };
  },
}));
vi.mock("@/lib/blog/queries", () => ({
  async getBlogPost(...args) {
    state.calls.push(["getBlogPost", ...args]);
    return state.result;
  },
  async getBlogRevision(...args) {
    state.calls.push(["getBlogRevision", ...args]);
    return state.result;
  },
}));
vi.mock("next/link", () => ({
  default: function Link({ children }) {
    return children;
  },
}));
vi.mock("@/components/ui/index.tsx", () => {
  const passthrough = ({ children }) => children;
  return {
    BackButton: passthrough,
    Button: passthrough,
    ButtonGroup: passthrough,
    Tooltip: passthrough,
    TooltipContent: passthrough,
    TooltipProvider: passthrough,
    TooltipTrigger: passthrough,
  };
});
vi.mock("@/components/blog/BlogArticle", () => ({
  BlogArticle({ document }) {
    return document.title;
  },
}));

const { default: PreviewPage, metadata } = await import("@/app/admin/(protected)/blog/[id]/preview/page.tsx");

function reset(result = null) {
  state.calls = [];
  state.denied = false;
  state.result = result;
}
const props = (id = "post-1", revision) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve({ revision }),
});

test("private preview checks permission before any content read and stays non-indexable", async () => {
  reset();
  state.denied = true;
  await expect(PreviewPage(props())).rejects.toThrow(/DENIED/);
  expect(state.calls).toEqual([["permission", "blog", "view"]]);
  expect(metadata.robots).toEqual({ index: false, follow: false });
});

test("preview keeps historical revisions scoped to the requested post and authenticated admin", async () => {
  reset({ document: { title: "Historical title" } });
  const markup = renderToStaticMarkup(await PreviewPage(props("post-1", "revision-2")));
  expect(state.calls[1]).toEqual(["getBlogRevision", "admin", "post-1", "revision-2"]);
  expect(markup).toMatch(/Historical title/);
  reset({ draftDocument: { title: "Saved draft title" } });
  expect(renderToStaticMarkup(await PreviewPage(props()))).toMatch(/Saved draft title/);
  expect(state.calls[1]).toEqual(["getBlogPost", "admin", "post-1"]);
});

test("malformed or missing previews do not render article content", async () => {
  reset();
  await expect(PreviewPage(props("../bad"))).rejects.toThrow(/NOT_FOUND/);
  await expect(PreviewPage(props("post-1", ["revision-1"]))).rejects.toThrow(/NOT_FOUND/);
  await expect(PreviewPage(props("post-1", ["revision-1", "revision-2"]))).rejects.toThrow(/NOT_FOUND/);
  expect(state.calls.filter((call) => call[0] !== "permission").length).toBe(0);
  await expect(PreviewPage(props())).rejects.toThrow(/NOT_FOUND/);
});
