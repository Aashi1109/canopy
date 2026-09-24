import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Button } from "@/components/ui/components/button.tsx";

test("loading buttons remain labelled and disable activation until ready", () => {
  const loading = renderToStaticMarkup(createElement(Button, { loading: true }, "Save"));
  expect(loading).toMatch(/disabled=""/);
  expect(loading).toMatch(/aria-busy="true"/);
  expect(loading).toMatch(/<svg[^>]*aria-hidden="true"/);
  expect(loading).toMatch(/Save/);
  const ready = renderToStaticMarkup(createElement(Button, null, "Save"));
  expect(ready).not.toMatch(/disabled=|aria-busy="true"|<svg/);
  const link = renderToStaticMarkup(
    createElement(Button, { asChild: true, loading: true }, createElement("a", { href: "/admin" }, "Open")),
  );
  expect(link).toMatch(/<a[^>]*inert=""/);
  expect(link).toMatch(/aria-disabled="true"/);
  expect(link).toMatch(/Open<\/a>/);
});
