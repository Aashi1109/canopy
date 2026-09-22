import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "next/dist/build/swc/index.js";

const root = new URL("../", import.meta.url);
const stub = (source) => ({
  shortCircuit: true,
  url: `data:text/javascript,${encodeURIComponent(source)}`,
});
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/link") return next("next/link.js", context);
    if (specifier === "next/navigation")
      return stub(
        'export function useRouter(){return {push(){},refresh(){}}} export function usePathname(){return globalThis.__adminShellPath ?? "/admin/blog"} export function useSelectedLayoutSegment(){return null} export function useSearchParams(){return new URLSearchParams()} export function notFound(){throw Error("NOT_FOUND")}',
      );
    if (specifier === "@/lib/admin/access")
      return stub('export async function requirePagePermission(){return {user:{id:"admin"}}}');
    if (specifier === "@/lib/blog/queries")
      return stub(
        "export async function listBlogTaxonomy(){return {items:[],nextCursor:null,total:60,page:1,pageCount:3}}",
      );
    if (specifier === "../actions")
      return stub(
        'export async function mutateBlogAction(){throw Error("Unexpected mutation")} export async function readBlogAction(){throw Error("Unexpected query")}',
      );
    if (specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), root).href;
    if (
      (specifier.startsWith(".") || specifier.startsWith("file:")) &&
      context.parentURL?.startsWith("file:") &&
      !context.parentURL.includes("/node_modules/")
    ) {
      const target = new URL(specifier, context.parentURL);
      for (const extension of ["", ".ts", ".tsx"])
        if (existsSync(new URL(target.href + extension))) return next(target.href + extension, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".css"))
      return {
        format: "module",
        shortCircuit: true,
        source: "export default new Proxy({}, { get: (_, name) => String(name) });",
      };
    if (url.endsWith(".png"))
      return {
        format: "module",
        shortCircuit: true,
        source: 'export default {src:"/test-logo.png"};',
      };
    if (!url.endsWith(".tsx")) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: transformSync(readFileSync(new URL(url), "utf8"), {
        filename: new URL(url).pathname,
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          transform: { react: { runtime: "automatic" } },
        },
        module: { type: "es6" },
      }).code,
    };
  },
});
const { BlogPosts } = await import("../app/admin/(protected)/blog/components/BlogPosts.tsx");
const { BlogPublishPanel } = await import("../app/admin/(protected)/blog/components/BlogPublishPanel.tsx");
const { filterRelatedTools } = await import("../app/admin/(protected)/blog/components/BlogPostSettings.tsx");
const { historyPageSchema } = await import("../app/admin/(protected)/blog/components/BlogHistoryPanel.tsx");
const { BlogRevisionList } = await import("../app/admin/(protected)/blog/components/BlogRevisionList.tsx");
const taxonomy = await import("../app/admin/(protected)/blog/taxonomy/page.tsx");
const { Pagination } = await import("../components/ui/components/Pagination.tsx");
const { AdminShell } = await import("../app/admin/(protected)/components/AdminShell.tsx");
test.after(() => {
  hooks.deregister();
});

test("clean admin routes retain the same workspace and navigation as their internal routes", () => {
  try {
    for (const path of [
      "/",
      "/tools",
      "/blog",
      "/blog/post-1",
      "/blog/taxonomy",
      "/templates/new",
      "/templates/post-1/manage",
      "/templates/post-1/advanced",
    ]) {
      const render = (pathname) => {
        globalThis.__adminShellPath = pathname;
        return renderToStaticMarkup(
          createElement(AdminShell, {
            user: { name: "Admin", isAdmin: true },
            publicSiteUrl: "https://example.test",
            children: createElement("section", null, "Working document"),
          }),
        );
      };
      assert.equal(render(path), render(path === "/" ? "/admin" : `/admin${path}`), path);
    }
  } finally {
    delete globalThis.__adminShellPath;
  }
});

test("history panel accepts paginated revision responses and rejects malformed data", () => {
  const revision = {
    id: "revision-1",
    revisionNumber: 1,
    title: "Saved draft",
    reason: "manual_save",
    createdAt: "2026-09-16T10:00:00Z",
  };
  const page = historyPageSchema.parse({ items: [revision], nextCursor: "older", page: 1, pageCount: 2, total: 26 });
  assert.equal(page.items[0].createdAt.getTime(), Date.parse(revision.createdAt));
  assert.equal(page.nextCursor, "older");
  assert.deepEqual(historyPageSchema.parse({ items: [], nextCursor: null, page: 1, pageCount: 1, total: 0 }), {
    items: [],
    nextCursor: null,
    page: 1,
    pageCount: 1,
    total: 0,
  });
  assert.equal(
    historyPageSchema.safeParse({
      items: [{ ...revision, createdAt: "invalid" }],
      nextCursor: null,
    }).success,
    false,
  );
  assert.equal(
    historyPageSchema.safeParse({ items: [{ id: "category", name: "News" }], nextCursor: null }).success,
    false,
  );
});

function revisionLinks(props) {
  const html = renderToStaticMarkup(
    createElement(BlogRevisionList, {
      postId: "post-1",
      version: 3,
      publishedRevisionId: null,
      canRestore: false,
      revisions: [
        {
          id: "revision-2",
          revisionNumber: 2,
          title: "Second draft",
          reason: "manual_save",
          createdAt: new Date("2026-09-16T10:00:00Z"),
        },
        {
          id: "revision-1",
          revisionNumber: 1,
          title: "First draft",
          reason: "manual_save",
          createdAt: new Date("2026-09-15T10:00:00Z"),
        },
      ],
      ...props,
    }),
  );
  return Array.from(html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g), ([, href, content]) => ({
    url: new URL(href.replaceAll("&amp;", "&"), "https://example.test"),
    label: content.replace(/<[^>]+>/g, "").trim(),
  }));
}

test("revision comparison opens and closes without losing pagination; previews retain the selected historical revision", () => {
  const cursor = "older/page?offset=2&filter=saved";
  const links = revisionLinks({
    historyCursor: cursor,
    comparedRevisionId: "revision-2",
    comparison: createElement("p", null, "Changes"),
  });
  const close = links.find((link) => link.label === "Hide details");
  assert.ok(close);
  assert.equal(close.url.pathname, "/admin/blog/post-1/history");
  assert.deepEqual([...close.url.searchParams], [["cursor", cursor]]);
  const compare = links.find((link) => link.label === "Compare");
  assert.equal(compare.url.pathname, "/admin/blog/post-1/history");
  assert.equal(compare.url.searchParams.get("cursor"), cursor);
  assert.equal(compare.url.searchParams.get("revision"), "revision-1");
  const previews = links.filter((link) => link.label === "Preview");
  assert.deepEqual(
    previews.map((link) => link.url.pathname),
    ["/admin/blog/post-1/preview", "/admin/blog/post-1/preview"],
  );
  assert.deepEqual(
    previews.map((link) => [...link.url.searchParams]),
    [[["revision", "revision-2"]], [["revision", "revision-1"]]],
  );

  const firstPageClose = revisionLinks({
    comparedRevisionId: "revision-2",
    comparison: createElement("p", null, "Changes"),
  }).find((link) => link.label === "Hide details");
  assert.equal(firstPageClose.url.pathname, "/admin/blog/post-1/history");
  assert.equal(firstPageClose.url.search, "");
});

test("compact history and rows without loaded comparison navigate to the revision instead of closing details", () => {
  for (const props of [
    { comparedRevisionId: "revision-2" },
    {
      compact: true,
      comparedRevisionId: "revision-2",
      comparison: createElement("p", null, "Changes"),
    },
  ]) {
    const links = revisionLinks(props);
    assert.equal(
      links.some((link) => link.label === "Hide details"),
      false,
    );
    const comparisons = links.filter((link) => link.label === "Compare");
    assert.deepEqual(
      comparisons.map((link) => link.url.pathname),
      ["/admin/blog/post-1/history", "/admin/blog/post-1/history"],
    );
    assert.deepEqual(
      comparisons.map((link) => [...link.url.searchParams]),
      [[["revision", "revision-2"]], [["revision", "revision-1"]]],
    );
  }
});

test("related tool search ignores case and surrounding whitespace without changing the catalog", () => {
  const tools = Object.freeze([
    Object.freeze({ id: "json", name: "JSON Formatter" }),
    Object.freeze({ id: "api", name: "API Key Generator" }),
    Object.freeze({ id: "uuid", name: "UUID Generator" }),
  ]);
  assert.deepEqual(filterRelatedTools(tools, "  gEnErAtOr  "), [tools[1], tools[2]]);
  assert.deepEqual(filterRelatedTools(tools, "json"), [tools[0]]);
  assert.deepEqual(filterRelatedTools(tools, "not a tool"), []);
  assert.deepEqual(filterRelatedTools(tools, ""), tools);
  assert.deepEqual(filterRelatedTools(tools, "   "), tools);
  assert.deepEqual(filterRelatedTools([], "json"), []);
});

test("a published article with a scheduled revision exposes both live and scheduled states", () => {
  const html = renderToStaticMarkup(
    createElement(BlogPosts, {
      posts: [
        {
          id: "post",
          title: "Live article",
          version: 1,
          updatedAt: new Date("2026-09-16T10:00:00Z"),
          publishedRevisionId: "live",
          trashedAt: null,
          hasUnpublishedChanges: true,
          schedule: { scheduledAt: new Date("2026-09-17T10:00:00Z"), lastErrorCode: "RETRY" },
        },
      ],
      categories: { items: [], nextCursor: null },
      filters: {},
      pagination: { page: 1, pageCount: 1, total: 0 },
      canCreate: false,
      canArchive: false,
      canManageTerms: false,
    }),
  );
  assert.match(html, /Update scheduled/);
  assert.match(html, /Current article is live/);
  assert.match(html, /Publishing delayed/);
});

test("taxonomy keeps the originating editor across topic type and pagination changes", async () => {
  const html = renderToStaticMarkup(
    await taxonomy.default({
      searchParams: Promise.resolve({ returnTo: "/admin/blog/post-1", page: "1" }),
    }),
  );
  assert.match(html, /href="\/admin\/blog\/post-1"/);
  assert.match(html, /kind=tag&amp;returnTo=%2Fadmin%2Fblog%2Fpost-1/);
  assert.match(html, /kind=category&amp;returnTo=%2Fadmin%2Fblog%2Fpost-1&amp;page=2/);
});

test("taxonomy rejects external, traversing, and repeated return destinations", async () => {
  for (const returnTo of [
    "https://attacker.invalid",
    "//attacker.invalid",
    "/admin/blog/../../outside",
    ["/admin/blog/post-1"],
  ]) {
    const html = renderToStaticMarkup(await taxonomy.default({ searchParams: Promise.resolve({ returnTo }) }));
    assert.doesNotMatch(html, /attacker|outside|returnTo=/);
    assert.match(html, /href="\/admin\/blog"/);
  }
});

test("taxonomy preserves clean admin destinations while rejecting lookalike origins", async () => {
  const previous = process.env.APP_URL;
  process.env.APP_URL = "https://example.test";
  try {
    for (const returnTo of ["/blog/post-1", "/admin/blog/post-1", "https://admin.example.test/blog/post-1"]) {
      const html = renderToStaticMarkup(await taxonomy.default({ searchParams: Promise.resolve({ returnTo }) }));
      assert.match(html, /href="https:\/\/admin\.example\.test\/blog\/post-1"/);
      assert.match(html, /kind=tag&amp;returnTo=https%3A%2F%2Fadmin\.example\.test%2Fblog%2Fpost-1/);
      assert.doesNotMatch(html, /href="[^\"]*\/admin\//);
    }
    for (const returnTo of [
      "https://admin.example.test.attacker.invalid/blog/post-1",
      "https://admin.example.test/blog/../outside",
    ]) {
      const html = renderToStaticMarkup(await taxonomy.default({ searchParams: Promise.resolve({ returnTo }) }));
      assert.doesNotMatch(html, /attacker|outside|returnTo=/);
      assert.match(html, /href="https:\/\/admin\.example\.test\/blog"/);
    }
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});

test("publication recovery selects the first failed requirement and blocks publishing", () => {
  const fixed = [];
  const element = BlogPublishPanel({
    mode: "now",
    onModeChange() {},
    schedule: { date: "", time: "09:00", timezone: "UTC" },
    onScheduleChange() {},
    timezones: ["UTC"],
    checks: [
      { id: "title", label: "Article title", valid: true },
      { id: "excerpt", label: "Article excerpt", valid: false },
      { id: "category", label: "Category", valid: false },
    ],
    searchPreview: { title: "Title", description: "", url: "/blog/post" },
    onEditSeo() {},
    onBack() {},
    onSubmit() {
      assert.fail("Invalid publication must not submit");
    },
    onFixCheck: (id) => fixed.push(id),
    canPublish: true,
  });
  function walk(node) {
    return Array.isArray(node)
      ? node.flatMap(walk)
      : node && typeof node === "object" && node.props
        ? [node, ...walk(node.props.children)]
        : [];
  }
  const action = walk(element).find((node) => Array.isArray(node.props.children) && node.props.children[0] === "Fix ");
  action.props.onClick();
  assert.deepEqual(fixed, ["excerpt"]);
  element.props.onSubmit({ preventDefault() {} });
  assert.match(renderToStaticMarkup(element), /type="submit"[^>]*disabled=""/);
});

test("numbered pagination keeps first and last jumps and handles both boundaries", () => {
  for (const page of [1, 2, 50, 99, 100]) {
    const html = renderToStaticMarkup(
      createElement(Pagination, {
        page,
        pageCount: 100,
        getPageHref: (target) => `/admin/audit?page=${target}`,
      }),
    );
    assert.match(html, /aria-label="Page 1"[^>]*href="\/admin\/audit\?page=1"/);
    assert.match(html, /aria-label="Page 100"[^>]*href="\/admin\/audit\?page=100"/);
    assert.match(html, new RegExp(`aria-label="Page ${page}" aria-current="page"`));
    if (page === 1) assert.match(html, /aria-label="Previous page"[^>]*disabled/);
    if (page === 100) assert.match(html, /aria-label="Next page"[^>]*disabled/);
  }
  const one = renderToStaticMarkup(createElement(Pagination, { page: 1, pageCount: 1 }));
  assert.equal([...one.matchAll(/aria-label="Page 1"/g)].length, 1);
});
