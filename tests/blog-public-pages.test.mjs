import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, test, vi } from "vitest";
import { createBlogDocument, BlogValidationError } from "../lib/blog/document.ts";

const state = {
  calls: [],
  post: null,
  posts: { items: [], nextCursor: null },
  categories: { items: [], nextCursor: null },
  error: null,
  relatedError: null,
  pendingRead: null,
  hookValues: [],
  hookIndex: 0,
};
globalThis.__publicBlogTest = state;

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal()),
  useState: (initial) => {
    const s = globalThis.__publicBlogTest;
    const i = s.hookIndex++;
    if (!(i in s.hookValues)) s.hookValues[i] = initial;
    return [
      s.hookValues[i],
      (value) => {
        s.hookValues[i] = typeof value === "function" ? value(s.hookValues[i]) : value;
      },
    ];
  },
  useRef: (initial) => {
    const s = globalThis.__publicBlogTest;
    const i = s.hookIndex++;
    if (!(i in s.hookValues)) s.hookValues[i] = { current: initial };
    return s.hookValues[i];
  },
}));
vi.mock("@/lib/blog/queries", () => {
  const s = () => globalThis.__publicBlogTest;
  return {
    getPublishedBlogPost: async (slug) => {
      s().calls.push(["post", slug]);
      if (s().error) throw s().error;
      return s().post;
    },
    listPublishedBlogPosts: async (input) => {
      s().calls.push(["posts", input]);
      if (s().error || s().relatedError) throw s().error || s().relatedError;
      if (s().pendingRead) return s().pendingRead;
      return s().posts;
    },
    listPublishedBlogTaxonomy: async (kind, input) => {
      s().calls.push(["categories", kind, input]);
      if (s().error) throw s().error;
      return s().categories;
    },
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("TEST_NOT_FOUND");
  },
}));

const listing = await import("../app/blog/page.tsx");
const article = await import("../app/blog/[slug]/page.tsx");
const { BlogArticle } = await import("../components/blog/BlogArticle.tsx");
const { BlogStories: InteractiveStories } = await import("../app/blog/components/BlogStories.tsx?interaction");
const { loadMoreBlogPosts } = await import("../app/blog/actions.ts");
const { parseBlogFilters } = await import("../app/blog/lib/filters.ts");
const { listPublishedBlogPosts: realPublishedQuery, encodeBlogCursor } =
  await vi.importActual("../lib/blog/queries.ts");
const { db } = await import("../db/index.ts");
afterAll(() => {
  delete globalThis.__publicBlogTest;
});

function reset() {
  state.calls = [];
  state.error = null;
  state.relatedError = null;
  state.post = null;
  state.pendingRead = null;
  state.hookValues = [];
  state.hookIndex = 0;
  state.posts = { items: [], nextCursor: null };
  state.categories = { items: [], nextCursor: null };
}
function published() {
  const document = {
    ...createBlogDocument("Live <script>title</script>"),
    excerpt: "Published summary",
    category: { id: "cat", label: "Guides" },
    body: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "First steps" }] },
        { type: "paragraph", content: [{ type: "text", text: "<script>unsafe()</script>" }] },
      ],
    },
  };
  return {
    id: "live",
    slug: "live-story",
    document,
    category: { id: "cat", label: "Guides", slug: "guides" },
    tags: [{ id: "tag", label: "PDF", slug: "pdf" }],
    relatedToolLinks: [{ id: "tool", name: "PDF tool", href: "/media/pdf-tool" }],
    firstPublishedAt: new Date("2026-09-16T10:00:00Z"),
    publishedUpdatedAt: new Date("2026-09-16T11:00:00Z"),
  };
}
const summary = (post) => ({ ...post, ...post.document });

test("public listing renders published summaries and keeps filters in next and clear-search links", async () => {
  reset();
  state.posts = { items: [summary(published())], nextCursor: "next-page" };
  state.categories = { items: [{ id: "cat", name: "Guides", slug: "guides" }], nextCursor: null };
  const html = renderToStaticMarkup(
    await listing.default({
      searchParams: Promise.resolve({
        search: "PDF & docs",
        category: "guides",
        tag: "pdf",
        cursor: "previous",
      }),
    }),
  );
  expect(state.calls[0]).toEqual([
    "posts",
    { search: "PDF & docs", category: "guides", tag: "pdf", cursor: "previous" },
  ]);
  expect(html).toMatch(/href="\/blog\/live-story"/);
  expect(html).toMatch(/search=PDF\+%26\+docs&amp;category=guides&amp;tag=pdf&amp;cursor=next-page/);
  expect(html).toMatch(/href="\/blog\?category=guides&amp;tag=pdf">Clear search/);
  expect(html).not.toMatch(/<script>title|unsafe\(\)/);
  expect(state.calls.every(([name]) => ["posts", "categories"].includes(name))).toBeTruthy();
});

test("empty blog has recovery and categories beyond the first page remain reachable", async () => {
  reset();
  state.categories = {
    items: Array.from({ length: 25 }, (_, i) => ({
      id: `cat-${i}`,
      name: `Topic ${i}`,
      slug: `topic-${i}`,
    })),
    nextCursor: "more-topics",
  };
  const html = renderToStaticMarkup(await listing.default({ searchParams: Promise.resolve({}) }));
  expect(html).toMatch(/Stories are on the way/);
  expect(html).toMatch(/href="\/"[^>]*>Explore tools/);
  expect(html).toMatch(/categoryCursor=more-topics/);
  expect(html).toMatch(/category=topic-24/);
});

test("malformed listing inputs do not reach queries and invalid cursors recover through not-found", async () => {
  reset();
  await expect(listing.default({ searchParams: Promise.resolve({ search: ["a", "b"] }) })).rejects.toThrow(
    /TEST_NOT_FOUND/,
  );
  expect(state.calls.length).toBe(0);
  state.error = new BlogValidationError("Invalid blog pagination cursor.");
  await expect(listing.default({ searchParams: Promise.resolve({ cursor: "bad" }) })).rejects.toThrow(/TEST_NOT_FOUND/);
  state.error = new Error("Database unavailable");
  await expect(listing.default({ searchParams: Promise.resolve({}) })).rejects.toThrow(/Database unavailable/);
});

test("article renders safe live content, heading destinations, tools, tags, metadata and JSON-LD", async () => {
  reset();
  state.post = published();
  state.posts = { items: [summary(state.post)], nextCursor: null };
  const html = renderToStaticMarkup(await article.default({ params: Promise.resolve({ slug: "live-story" }) }));
  expect(html).toMatch(/href="#heading-1"/);
  expect(html).toMatch(/<h2 id="heading-1">First steps<\/h2>/);
  expect(html).toMatch(/&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  expect(html).not.toMatch(/<script>unsafe/);
  expect(html).toMatch(/href="\/media\/pdf-tool"/);
  expect(html).toMatch(/href="\/blog\?tag=pdf"/);
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  expect(json.headline).toBe(state.post.document.title);
  expect(json.dateModified).toBe("2026-09-16T11:00:00.000Z");
  const metadata = await article.generateMetadata({
    params: Promise.resolve({ slug: "live-story" }),
  });
  expect(metadata.openGraph.type).toBe("article");
  expect(metadata.alternates.canonical).toMatch(/\/blog\/live-story$/);
  expect(state.calls.filter(([name]) => name === "posts")).toEqual([["posts", { category: "guides" }]]);
});

test("private preview shares safe article presentation without public share links or publication metadata", () => {
  const html = renderToStaticMarkup(createElement(BlogArticle, { document: published().document }));
  expect(html).toMatch(/href="#heading-1"/);
  expect(html).toMatch(/<h2 id="heading-1">First steps<\/h2>/);
  expect(html).not.toMatch(/Copy link|application\/ld\+json|dateTime=|href="\/blog\//);
});

test("a failure loading optional related stories does not hide the published article", async () => {
  reset();
  state.post = published();
  state.relatedError = new Error("Related query unavailable");
  const html = renderToStaticMarkup(await article.default({ params: Promise.resolve({ slug: "live-story" }) }));
  expect(html).toMatch(/<h2 id="heading-1">First steps<\/h2>/);
  expect(html).not.toMatch(/Related query unavailable/);
});

test("missing and malformed article slugs return not-found without leaking unpublished content", async () => {
  reset();
  await expect(article.default({ params: Promise.resolve({ slug: "../draft" }) })).rejects.toThrow(/TEST_NOT_FOUND/);
  expect(state.calls.length).toBe(0);
  await expect(article.default({ params: Promise.resolve({ slug: "unpublished" }) })).rejects.toThrow(/TEST_NOT_FOUND/);
  expect(state.calls).toEqual([["post", "unpublished"]]);
});

test("filtered listing metadata does not create duplicate indexed search pages", async () => {
  const metadata = await listing.generateMetadata({
    searchParams: Promise.resolve({ search: "invoice" }),
  });
  expect(metadata.robots.index).toBe(false);
  expect(metadata.alternates.canonical).toBe("/blog");
  expect(metadata.alternates.types["application/rss+xml"]).toBe("/blog/feed.xml");
});

test("load-more preserves loaded stories on failure, retries the same cursor, and appends unique stories", async () => {
  reset();
  const first = summary(published());
  const second = { ...first, id: "second", slug: "second-story", title: "Second story" };
  const props = {
    initialPage: { items: [first], nextCursor: "page-2" },
    filters: { category: "guides", search: "PDF" },
    intro: null,
    emptyState: null,
    topics: null,
  };
  const render = () => {
    state.hookIndex = 0;
    return InteractiveStories(props);
  };
  function findNext(element) {
    if (!element || typeof element !== "object") return undefined;
    if (element.type === "a" && element.props.rel === "next") return element;
    const children = element.props?.children;
    return (Array.isArray(children) ? children.flat(Infinity) : [children]).map(findNext).find(Boolean);
  }
  const click = (element) =>
    element.props.onClick({
      button: 0,
      preventDefault() {},
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    });
  let resolveRead;
  state.pendingRead = new Promise((resolve) => {
    resolveRead = resolve;
  });
  click(findNext(render()));
  click(findNext(render()));
  expect(state.calls.length, "a pending read cannot be submitted twice").toBe(1);
  expect(renderToStaticMarkup(render())).toMatch(/aria-busy="true"/);
  resolveRead({ items: [first, second, second], nextCursor: "page-3" });
  await new Promise(setImmediate);
  state.pendingRead = null;
  let html = renderToStaticMarkup(render());
  expect((html.match(/href="\/blog\/second-story"/g) ?? []).length).toBe(1);
  expect(html).toMatch(/1 more story loaded/);
  state.error = new Error("postgres://private-password");
  click(findNext(render()));
  await new Promise(setImmediate);
  html = renderToStaticMarkup(render());
  expect(html).toMatch(/href="\/blog\/second-story"/);
  expect(html).toMatch(/Try loading more/);
  expect(html).not.toMatch(/private-password/);
  expect(findNext(render()).props.href).toMatch(/cursor=page-3/);
  state.error = null;
  state.posts = { items: [], nextCursor: null };
  click(findNext(render()));
  await new Promise(setImmediate);
  expect(findNext(render())).toBe(undefined);
  expect(renderToStaticMarkup(render())).toMatch(/You’re up to date/);
  expect(state.calls.map(([, input]) => input.cursor)).toEqual(["page-2", "page-3", "page-3"]);
  expect(state.calls.every(([, input]) => input.category === "guides" && input.search === "PDF")).toBeTruthy();
});

test("public load-more action returns only published query data and safe actionable failures", async () => {
  reset();
  state.posts = { items: [summary(published())], nextCursor: null };
  const result = await loadMoreBlogPosts({ category: "guides", cursor: "page-2" });
  expect(result.ok).toBe(true);
  expect(state.calls).toEqual([["posts", { category: "guides", cursor: "page-2" }]]);
  state.error = new BlogValidationError("Invalid pagination cursor");
  const invalid = await loadMoreBlogPosts({ cursor: "invalid" });
  expect(invalid.ok).toBe(false);
  expect(invalid.message).toBe("Invalid pagination cursor");
  state.error = new Error("");
  expect((await loadMoreBlogPosts({})).message).toBe(
    "Couldn’t load more stories. Your loaded stories are still here. Try again.",
  );
});

test("load-more excludes taxonomy pagination fields from the real strict public query boundary", async () => {
  reset();
  const cursor = encodeBlogCursor({
    kind: "published",
    value: "2026-09-16T10:00:00.000001Z",
    id: "live",
  });
  const filters = parseBlogFilters({
    search: "PDF",
    category: "guides",
    categoryCursor: "taxonomy-only",
  });
  const props = {
    initialPage: { items: [summary(published())], nextCursor: cursor },
    filters,
    intro: null,
    emptyState: null,
    topics: null,
  };
  state.hookIndex = 0;
  const tree = InteractiveStories(props);
  function visit(element) {
    if (!element || typeof element !== "object") return undefined;
    if (element.type === "a" && element.props.rel === "next") return element;
    const children = element.props?.children;
    return (Array.isArray(children) ? children.flat(Infinity) : [children]).map(visit).find(Boolean);
  }
  visit(tree).props.onClick({ button: 0, preventDefault() {} });
  await new Promise(setImmediate);
  const payload = state.calls[0][1];
  expect(Object.hasOwn(payload, "categoryCursor")).toBe(false);
  const original = db.select;
  let reads = 0;
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => [],
  };
  db.select = () => {
    reads++;
    return chain;
  };
  try {
    expect(await realPublishedQuery(payload)).toEqual({ items: [], nextCursor: null });
    expect(reads).toBe(1);
    await expect(realPublishedQuery({ ...payload, categoryCursor: undefined })).rejects.toThrow();
    expect(reads, "an unknown field is rejected before opening a database query").toBe(1);
  } finally {
    db.select = original;
  }
});
