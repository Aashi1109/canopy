import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "next/dist/build/swc/index.js";

const pageUrl = new URL("../app/admin/(protected)/blog/[id]/preview/page.tsx", import.meta.url).href;
const isPage = (url) => url?.startsWith("file:") && fileURLToPath(url) === fileURLToPath(pageUrl);
const state = { calls: [], denied: false, result: null };
globalThis.__blogPreviewTest = state;
const stub = (source) => ({
  shortCircuit: true,
  url: `data:text/javascript,${encodeURIComponent(source)}`,
});
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (isPage(context.parentURL)) {
      if (specifier === "next/navigation") return stub('export function notFound(){throw new Error("NOT_FOUND")}');
      if (specifier === "@/lib/admin/access")
        return stub(
          'export async function requirePagePermission(...args){const s=globalThis.__blogPreviewTest;s.calls.push(["permission",...args]);if(s.denied)throw new Error("DENIED");return {user:{id:"admin"}};}',
        );
      if (specifier === "@/lib/blog/queries")
        return stub(
          ["getBlogPost", "getBlogRevision"]
            .map(
              (name) =>
                `export async function ${name}(...args){const s=globalThis.__blogPreviewTest;s.calls.push(["${name}",...args]);return s.result;}`,
            )
            .join("\n"),
        );
      if (specifier === "next/link") return stub("export default function Link({children}){return children}");
      if (specifier === "@/components/ui/index.tsx") return stub("export function Button({children}){return children}");
      if (specifier === "@/components/blog/BlogArticle")
        return stub("export function BlogArticle({document}){return document.title}");
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!isPage(url)) return next(url, context);
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
const { default: PreviewPage, metadata } = await import(pageUrl);
test.after(() => {
  hooks.deregister();
  delete globalThis.__blogPreviewTest;
});
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
  await assert.rejects(PreviewPage(props()), /DENIED/);
  assert.deepEqual(state.calls, [["permission", "blog", "view"]]);
  assert.deepEqual(metadata.robots, { index: false, follow: false });
});

test("preview keeps historical revisions scoped to the requested post and authenticated admin", async () => {
  reset({ document: { title: "Historical title" } });
  const markup = renderToStaticMarkup(await PreviewPage(props("post-1", "revision-2")));
  assert.deepEqual(state.calls[1], ["getBlogRevision", "admin", "post-1", "revision-2"]);
  assert.match(markup, /Historical title/);
  assert.match(markup, /Historical revision/);
  reset({ draftDocument: { title: "Saved draft title" } });
  assert.match(renderToStaticMarkup(await PreviewPage(props())), /Saved draft title/);
  assert.deepEqual(state.calls[1], ["getBlogPost", "admin", "post-1"]);
});

test("malformed or missing previews do not render article content", async () => {
  reset();
  await assert.rejects(PreviewPage(props("../bad")), /NOT_FOUND/);
  await assert.rejects(PreviewPage(props("post-1", ["revision-1"])), /NOT_FOUND/);
  await assert.rejects(PreviewPage(props("post-1", ["revision-1", "revision-2"])), /NOT_FOUND/);
  assert.equal(state.calls.filter((call) => call[0] !== "permission").length, 0);
  await assert.rejects(PreviewPage(props()), /NOT_FOUND/);
});
