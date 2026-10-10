import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { beforeEach, expect, test, vi } from "vitest";

const telemetry = vi.hoisted(() => ({ analytics: vi.fn(), speedInsights: vi.fn() }));

vi.mock("next/font/google", () => {
  const font = ({ variable }) => ({ variable });
  return { Caveat: font, Funnel_Sans: font, Geist: font, Geist_Mono: font, Inter: font };
});
vi.mock("../components/ui/index.tsx", () => ({ SavedToolsProvider: ({ children }) => children }));
vi.mock("../components/ui/components/GlobalToolSearch", () => ({
  GlobalToolSearchProvider: ({ children }) => children,
}));
vi.mock("next-intl", () => ({ NextIntlClientProvider: ({ children }) => children }));
vi.mock("../components/i18n/DirectionProvider", () => ({ DirectionProvider: ({ children }) => children }));
vi.mock("../components/analytics/Analytics", () => ({
  Analytics: ({ children }) => {
    telemetry.analytics();
    return createElement(
      Fragment,
      null,
      children,
      createElement("aside", { "aria-label": "Analytics permission" }, "Help improve SmartTools?"),
      createElement("script", { src: "https://www.googletagmanager.com/gtag/js?id=G-TEST" }),
    );
  },
}));
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => {
    telemetry.speedInsights();
    return createElement("script", { src: "/_vercel/speed-insights/script.js" });
  },
}));

import AdminRootLayout from "../app/admin/layout.tsx";
import AuthLayout from "../app/auth/layout.tsx";
import AccountLayout from "../app/account/layout.tsx";
import { DocumentRoot } from "../components/i18n/DocumentRoot.tsx";

beforeEach(() => vi.clearAllMocks());

const content = createElement("main", null, createElement("h1", null, "Admin overview"));
const render = (node) => new JSDOM(renderToStaticMarkup(node)).window.document;

for (const [name, Layout] of [
  ["admin", AdminRootLayout],
  ["authentication", AuthLayout],
  ["account", AccountLayout],
]) {
  test(`${name} pages render their workspace without advertising, analytics consent, or telemetry`, () => {
    const document = render(createElement(Layout, null, content));
    expect(document.querySelector("main h1")?.textContent).toBe("Admin overview");
    expect(document.querySelectorAll("script")).toHaveLength(0);
    expect(document.querySelector('[aria-label="Analytics permission"]')).toBeNull();
    expect(telemetry.analytics).not.toHaveBeenCalled();
    expect(telemetry.speedInsights).not.toHaveBeenCalled();
  });
}

test("public documents retain their existing consent and telemetry integrations", () => {
  const document = render(createElement(DocumentRoot, null, content));
  expect(document.querySelector("main h1")?.textContent).toBe("Admin overview");
  const sources = [...document.querySelectorAll("script[src]")].map((script) => script.getAttribute("src"));
  expect(sources).toContain(
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5442003096820885",
  );
  expect(sources).toContain("https://www.googletagmanager.com/gtag/js?id=G-TEST");
  expect(sources).toContain("/_vercel/speed-insights/script.js");
  expect(document.querySelector('[aria-label="Analytics permission"]')?.textContent).toBe("Help improve SmartTools?");
  expect(telemetry.analytics).toHaveBeenCalledOnce();
  expect(telemetry.speedInsights).toHaveBeenCalledOnce();
});

test("an explicitly private document keeps locale and content while omitting public tracking", () => {
  const document = render(createElement(DocumentRoot, { publicTracking: false, locale: "ar" }, content));
  expect(document.documentElement.lang).toBe("ar");
  expect(document.documentElement.dir).toBe("rtl");
  expect(document.querySelector("main h1")?.textContent).toBe("Admin overview");
  expect(document.querySelectorAll("script")).toHaveLength(0);
  expect(document.querySelector('[aria-label="Analytics permission"]')).toBeNull();
  expect(telemetry.analytics).not.toHaveBeenCalled();
  expect(telemetry.speedInsights).not.toHaveBeenCalled();
});
