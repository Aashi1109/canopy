import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "next/dist/build/swc/index.js";

const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith(".tsx")) return nextLoad(url, context);
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
const { ContentState } = await import("../components/ui/components/ContentState.tsx");
hooks.deregister();
const render = (props) => renderToStaticMarkup(createElement(ContentState, props));

test("passive empty content has a semantic heading and no invented recovery action", () => {
  const html = render({ title: "No revisions yet", description: "Save a draft to create a revision." });
  assert.match(html, /<h2\b[^>]*>No revisions yet<\/h2>/);
  assert.match(html, /Save a draft to create a revision\./);
  assert.doesNotMatch(html, /<button|<a\s|<svg|role="alert"/);
});

test("page errors preserve caller-owned recovery and heading semantics", () => {
  const html = render({
    state: "error",
    headingLevel: "h1",
    title: "Could not load posts",
    action: createElement("button", { disabled: true, "aria-busy": true }, "Trying…"),
    secondaryAction: createElement("a", { href: "/blog" }, "All posts"),
  });
  assert.match(html, /<h1\b[^>]*>Could not load posts<\/h1>/);
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-busy="true"/);
  assert.match(html, /<a href="\/blog">All posts<\/a>/);
  assert.match(html, /aria-hidden="true"/);
});

test("compact states support an explicitly absent icon and opt-in announcements", () => {
  const html = render({
    title: "No matching tools",
    state: "error",
    icon: null,
    density: "compact",
    announcement: "polite",
  });
  assert.doesNotMatch(html, /<svg/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-atomic="true"/);
});

test("loading announces progress, while the caller controls its recovery action", () => {
  const html = render({
    state: "loading",
    title: "Loading history",
    secondaryAction: createElement("button", {}, "Cancel"),
  });
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<button>Cancel<\/button>/);
  assert.doesNotMatch(html, /disabled=/);
});

test("host accessibility attributes and heading level are retained", () => {
  const html = render({
    title: "No matches",
    headingLevel: "h3",
    id: "search-status",
    "aria-label": "Search feedback",
  });
  assert.match(html, /id="search-status"/);
  assert.match(html, /aria-label="Search feedback"/);
  assert.match(html, /<h3\b[^>]*>No matches<\/h3>/);
});

test("waiting, cancellation and successful no-output states do not invent retry or download actions", () => {
  for (const state of ["waiting", "cancelled", "complete"]) {
    const html = render({ state, title: "Caller-owned status", description: "<untrusted>" });
    assert.match(html, /&lt;untrusted&gt;/);
    assert.doesNotMatch(html, /<button|<a\s|<svg/);
  }
});
