import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "next/dist/build/swc/index.js";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = new URL(`../${specifier.slice(2)}`, import.meta.url);
      for (const extension of ["", ".ts", ".tsx"]) {
        if (existsSync(new URL(target.href + extension))) return nextResolve(target.href + extension, context);
      }
    }
    return nextResolve(specifier, context);
  },
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
const { ProductHeader } = await import("../components/ui/index.tsx");
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

test("auth navigation on the admin host sends home and suite links to the public site", () => {
  const html = renderToStaticMarkup(
    createElement(ProductHeader, {
      href: "/auth",
      name: "SmartTools",
      account: { publicSiteUrl: "https://example.test", returnTo: "/auth", showSignIn: false, user: null },
    }),
  );
  const destinations = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(destinations, [
    "https://example.test/",
    "https://example.test/",
    "https://example.test/paperwork",
    "https://example.test/devtools",
    "https://example.test/media",
    "https://example.test/blog",
  ]);
});

test("restricted headers can return home without exposing an account menu", () => {
  const html = renderToStaticMarkup(
    createElement(ProductHeader, {
      href: "https://example.test",
      publicSiteUrl: "https://example.test",
      name: "SmartTools",
      minimal: true,
    }),
  );
  assert.match(html, /aria-label="SmartTools home"[^>]*href="https:\/\/example\.test\/"/);
  assert.doesNotMatch(html, /href="\/"/);
});
