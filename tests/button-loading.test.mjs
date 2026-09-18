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
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          transform: { react: { runtime: "automatic" } },
        },
        module: { type: "es6" },
      }).code,
    };
  },
});
const { Button } = await import("../components/ui/components/button.tsx");
hooks.deregister();

test("loading buttons remain labelled and disable activation until ready", () => {
  const loading = renderToStaticMarkup(createElement(Button, { loading: true }, "Save"));
  assert.match(loading, /disabled=""/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /<svg[^>]*aria-hidden="true"/);
  assert.match(loading, /Save/);
  const ready = renderToStaticMarkup(createElement(Button, null, "Save"));
  assert.doesNotMatch(ready, /disabled=|aria-busy="true"|<svg/);
  const link = renderToStaticMarkup(
    createElement(Button, { asChild: true, loading: true }, createElement("a", { href: "/admin" }, "Open")),
  );
  assert.match(link, /<a[^>]*inert=""/);
  assert.match(link, /aria-disabled="true"/);
  assert.match(link, /Open<\/a>/);
});
