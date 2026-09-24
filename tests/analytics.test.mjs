import { expect, test } from "vitest";
import { CONSENT_KEY, createAnalytics, measurementId, publicPath } from "../lib/analytics/ga4.ts";

function browserFixture(saved, storageBlocked = false) {
  const scripts = [];
  const cookies = [];
  const values = new Map(saved ? [[CONSENT_KEY, saved]] : []);
  const browser = {
    location: { pathname: "/media/compress-image", origin: "https://smarttools.lol" },
    localStorage: {
      getItem: (key) => {
        if (storageBlocked) throw Error("blocked");
        return values.get(key);
      },
      setItem: (key, value) => {
        if (storageBlocked) throw Error("blocked");
        values.set(key, value);
      },
    },
    document: {
      referrer: "https://search.example/results?email=private@example.com#secret",
      head: { append: (script) => scripts.push(script) },
      createElement: () => ({}),
      get cookie() {
        return "_ga=value; _ga_TEST=value; essential=session";
      },
      set cookie(value) {
        cookies.push(value);
      },
    },
  };
  const events = () => (browser.dataLayer ?? []).map((entry) => [...entry]).filter(([command]) => command === "event");
  return { browser, scripts, cookies, events };
}

test("GA4 is valid only in production, never in previews or development", () => {
  expect(measurementId({ NODE_ENV: "production", GA_MEASUREMENT_ID: "G-ABC123" })).toBe("G-ABC123");
  for (const env of [
    { NODE_ENV: "development", GA_MEASUREMENT_ID: "G-ABC123" },
    { NODE_ENV: "production", VERCEL_ENV: "preview", GA_MEASUREMENT_ID: "G-ABC123" },
    { NODE_ENV: "production", GA_MEASUREMENT_ID: 'G-X"><script>' },
    { NODE_ENV: "production" },
  ])
    expect(measurementId(env)).toBe(null);
});

test("public paths discard queries, hashes and arbitrary dynamic identifiers", () => {
  expect(publicPath("/privacy?email=secret#token")).toBe("/privacy");
  expect(publicPath("/media/customer-jane-doe")).toBe("/media/[tool]");
  for (const path of [
    "/auth",
    "/auth/profile",
    "/admin/tools/123",
    "/account/suspended",
    "/unknown/private",
    "/media/name%40email.com",
    "/media/tool/document-id",
  ])
    expect(publicPath(path)).toBe(null);
});

test("no network or queued events before permission, after decline, or when disabled", () => {
  for (const [saved, id] of [
    [undefined, "G-TEST"],
    ["declined", "G-TEST"],
    ["accepted", null],
    ["accepted", "invalid"],
  ]) {
    const { browser, scripts, events } = browserFixture(saved);
    const client = createAnalytics(browser, id);
    client.pageView();
    client.track("tool_start");
    expect(scripts.length).toBe(0);
    expect(browser.dataLayer).toBe(undefined);
    expect(events()).toEqual([]);
  }
});

test("opt-in loads once; manual SPA views are deduplicated and payloads contain no private URL data", () => {
  const { browser, scripts, events } = browserFixture();
  const client = createAnalytics(browser, "G-TEST");
  client.setConsent("accepted");
  expect(scripts.length).toBe(1);
  expect(events().length).toBe(0);
  scripts[0].onload();
  client.pageView();
  expect(events().length).toBe(1);
  expect(events()[0][2].page_referrer).toBe("https://search.example");
  browser.location.pathname = "/devtools/json-formatter";
  client.pageView();
  client.pageView();
  expect(events().length).toBe(2);
  client.track("tool_complete");
  client.track("private-payload");
  expect(events().at(-1)).toEqual([
    "event",
    "tool_complete",
    {
      page_location: "https://smarttools.lol/devtools/[tool]",
      page_referrer: "https://smarttools.lol/media/[tool]",
      page_title: "SmartTools",
    },
  ]);
  const configs = browser.dataLayer.map((entry) => [...entry]).filter(([command]) => command === "config");
  expect(
    configs.every(
      (entry) =>
        entry[2].send_page_view === false &&
        entry[2].allow_google_signals === false &&
        entry[2].allow_ad_personalization_signals === false,
    ),
  ).toBeTruthy();
  expect(scripts.length).toBe(1);
});

test("private SPA navigation disables collection and returning resumes a single safe view", () => {
  const { browser, scripts, events } = browserFixture("accepted");
  const client = createAnalytics(browser, "G-TEST");
  client.pageView();
  scripts[0].onload();
  browser.location.pathname = "/auth/profile";
  client.pageView();
  client.track("result_download");
  expect(browser["ga-disable-G-TEST"]).toBe(true);
  expect(events().length).toBe(1);
  browser.location.pathname = "/";
  client.pageView();
  expect(browser["ga-disable-G-TEST"]).toBe(false);
  expect(events().length).toBe(2);
  expect(events().at(-1)[2].page_referrer).toBe("");
});

test("revocation stops collection, clears GA cookies, and regrant works without another script", () => {
  const { browser, scripts, cookies, events } = browserFixture("accepted");
  const client = createAnalytics(browser, "G-TEST");
  client.pageView();
  scripts[0].onload();
  client.setConsent("declined");
  client.track("tool_complete");
  expect(browser["ga-disable-G-TEST"]).toBe(true);
  expect(events()).toEqual([]);
  expect(cookies).toEqual(["_ga=; Max-Age=0; Path=/; SameSite=Lax", "_ga_TEST=; Max-Age=0; Path=/; SameSite=Lax"]);
  client.setConsent("accepted");
  expect(events().length).toBe(1);
  expect(scripts.length).toBe(1);
});

test("blocked storage and Google never break tool interactions", () => {
  const { browser, scripts, events } = browserFixture(undefined, true);
  const client = createAnalytics(browser, "G-TEST");
  expect(client.consent()).toBe(null);
  expect(client.setConsent("accepted")).toBe(false);
  scripts[0].onerror();
  expect(() => client.track("tool_start")).not.toThrow();
  expect(events()).toEqual([]);
  scripts[0].onload();
  browser.gtag = () => {
    throw Error("blocked");
  };
  expect(() => client.track("result_copy")).not.toThrow();
  expect(() => client.setConsent("declined")).not.toThrow();
});

test("revocation or private navigation while script loads cannot leak a delayed view", () => {
  for (const revoke of [true, false]) {
    const { browser, scripts, events } = browserFixture("accepted");
    const client = createAnalytics(browser, "G-TEST");
    client.pageView();
    if (revoke) client.setConsent("declined");
    else {
      browser.location.pathname = "/admin";
      client.pageView();
    }
    scripts[0].onload();
    expect(events()).toEqual([]);
    expect(browser["ga-disable-G-TEST"]).toBe(true);
  }
});

test("tool events accept a bounded compiled key without accepting arbitrary payloads", () => {
  const { browser, scripts, events } = browserFixture("accepted");
  const client = createAnalytics(browser, "G-TEST");
  client.pageView();
  scripts[0].onload();
  client.track("tool_complete", "json-formatter");
  expect(events().at(-1)[2].tool_key).toBe("json-formatter");
  for (const key of ["report.pdf", "jane@example.com", "User Name", "x".repeat(65), undefined]) {
    client.track("result_copy", key);
    expect(events().at(-1)[2].tool_key).toBe(undefined);
  }
});

test("blocked script insertion and cookie access preserve app behavior and consent", () => {
  for (const blocked of ["append", "cookie-read", "cookie-write"]) {
    const { browser, events } = browserFixture();
    if (blocked === "append")
      browser.document.head.append = () => {
        throw Error("blocked");
      };
    else
      Object.defineProperty(browser.document, "cookie", {
        get() {
          if (blocked === "cookie-read") throw Error("blocked");
          return "_ga=value";
        },
        set() {
          throw Error("blocked");
        },
      });
    const client = createAnalytics(browser, "G-TEST");
    expect(() => client.setConsent("accepted")).not.toThrow();
    expect(() => client.setConsent("declined")).not.toThrow();
    expect(client.consent()).toBe("declined");
    expect(browser["ga-disable-G-TEST"]).toBe(true);
    expect(events()).toEqual([]);
  }
});
