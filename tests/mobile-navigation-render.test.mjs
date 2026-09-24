import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MobileNavigation } from "../components/ui/components/MobileNavigation.tsx";
import { ProductHeader } from "../components/ui/index.tsx";

test("guest navigation exposes separate search and menu controls", () => {
  const html = renderToStaticMarkup(createElement(MobileNavigation, { currentHref: "/media" }));
  expect(html).toMatch(/aria-label="Search tools"/);
  expect(html).toMatch(/aria-label="Open navigation menu"/);
  expect((html.match(/<button\b/g) ?? []).length).toBe(2);
  expect(html).not.toMatch(/Mobile site navigation/);
});

test("signed-in navigation exposes one combined account/menu control, not an extra profile button", () => {
  const html = renderToStaticMarkup(
    createElement(MobileNavigation, {
      currentHref: "/devtools",
      account: { returnTo: "/devtools", user: { name: "Jordan Chen", isAdmin: true } },
    }),
  );
  expect(html).toMatch(/aria-label="Search tools"/);
  expect(html).toMatch(/aria-label="Open navigation and account menu for Jordan Chen"/);
  expect(html).toMatch(/>JC<\/span>/);
  expect((html.match(/<button\b/g) ?? []).length).toBe(2);
  expect(html).not.toMatch(/aria-label="Open navigation menu"/);
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
  expect(destinations).toEqual([
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
  expect(html).toMatch(/aria-label="SmartTools home"[^>]*href="https:\/\/example\.test\/"/);
  expect(html).not.toMatch(/href="\/"/);
});
