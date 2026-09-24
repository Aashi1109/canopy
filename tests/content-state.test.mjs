import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ContentState } from "../components/ui/components/ContentState.tsx";

const render = (props) => renderToStaticMarkup(createElement(ContentState, props));

test("passive empty content has a semantic heading and no invented recovery action", () => {
  const html = render({ title: "No revisions yet", description: "Save a draft to create a revision." });
  expect(html).toMatch(/<h2\b[^>]*>No revisions yet<\/h2>/);
  expect(html).toMatch(/Save a draft to create a revision\./);
  expect(html).not.toMatch(/<button|<a\s|<svg|role="alert"/);
});

test("page errors preserve caller-owned recovery and heading semantics", () => {
  const html = render({
    state: "error",
    headingLevel: "h1",
    title: "Could not load posts",
    action: createElement("button", { disabled: true, "aria-busy": true }, "Trying…"),
    secondaryAction: createElement("a", { href: "/blog" }, "All posts"),
  });
  expect(html).toMatch(/<h1\b[^>]*>Could not load posts<\/h1>/);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"/);
  expect(html).toMatch(/<a href="\/blog">All posts<\/a>/);
  expect(html).toMatch(/aria-hidden="true"/);
});

test("compact states support an explicitly absent icon and opt-in announcements", () => {
  const html = render({
    title: "No matching tools",
    state: "error",
    icon: null,
    density: "compact",
    announcement: "polite",
  });
  expect(html).not.toMatch(/<svg/);
  expect(html).toMatch(/aria-live="polite"/);
  expect(html).toMatch(/aria-atomic="true"/);
});

test("loading announces progress, while the caller controls its recovery action", () => {
  const html = render({
    state: "loading",
    title: "Loading history",
    secondaryAction: createElement("button", {}, "Cancel"),
  });
  expect(html).toMatch(/aria-live="polite"/);
  expect(html).toMatch(/<button>Cancel<\/button>/);
  expect(html).not.toMatch(/disabled=/);
});

test("host accessibility attributes and heading level are retained", () => {
  const html = render({
    title: "No matches",
    headingLevel: "h3",
    id: "search-status",
    "aria-label": "Search feedback",
  });
  expect(html).toMatch(/id="search-status"/);
  expect(html).toMatch(/aria-label="Search feedback"/);
  expect(html).toMatch(/<h3\b[^>]*>No matches<\/h3>/);
});

test("waiting, cancellation and successful no-output states do not invent retry or download actions", () => {
  for (const state of ["waiting", "cancelled", "complete"]) {
    const html = render({ state, title: "Caller-owned status", description: "<untrusted>" });
    expect(html).toMatch(/&lt;untrusted&gt;/);
    expect(html).not.toMatch(/<button|<a\s|<svg/);
  }
});
