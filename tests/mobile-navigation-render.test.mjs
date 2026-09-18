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
const { MobileNavigation } = await import("../components/ui/components/MobileNavigation.tsx");
hooks.deregister();

test("guest navigation exposes separate search and menu controls", () => {
  const html = renderToStaticMarkup(createElement(MobileNavigation, { currentHref: "/media" }));
  assert.match(html, /aria-label="Search tools"/);
  assert.match(html, /aria-label="Open navigation menu"/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 2);
  assert.doesNotMatch(html, /Mobile site navigation/);
});

test("signed-in navigation exposes one combined account/menu control, not an extra profile button", () => {
  const html = renderToStaticMarkup(
    createElement(MobileNavigation, {
      currentHref: "/devtools",
      account: { returnTo: "/devtools", user: { name: "Jordan Chen", isAdmin: true } },
    }),
  );
  assert.match(html, /aria-label="Search tools"/);
  assert.match(html, /aria-label="Open navigation and account menu for Jordan Chen"/);
  assert.match(html, />JC<\/span>/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 2);
  assert.doesNotMatch(html, /aria-label="Open navigation menu"/);
});
