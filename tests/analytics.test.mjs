import { expect, test } from "vitest";
import { CONSENT_KEY, createAnalytics, measurementId, publicPath } from "../lib/analytics/ga4.ts";

test("localized public routes retain privacy filtering and private routes stay excluded", () => {
  expect(publicPath("/hi/media/compress-image?secret=input")).toBe("/media/[tool]");
  expect(publicPath("/ar/privacy")).toBe("/privacy");
  expect(publicPath("/pt-BR")).toBe("/");
  for (const path of ["/hi/admin", "/fr/auth/profile", "/de/account/history", "/unsupported/media/compress-image"]) {
    expect(publicPath(path)).toBeNull();
  }
});

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

test("admin origins are private even when their visible path looks public", () => {
  for (const origin of [
    "https://admin.smarttools.lol",
    "https://ADMIN.smarttools.lol:8443",
    "http://admin.localhost:3000",
  ]) {
    for (const path of ["/", "/privacy", "/media/compress-image", "/hi/media/compress-image", "/admin"]) {
      expect(publicPath(path, origin)).toBeNull();
    }
  }
  for (const origin of ["https://smarttools.lol", "https://www.smarttools.lol", "http://localhost:3000"]) {
    expect(publicPath("/", origin)).toBe("/");
    expect(publicPath("/hi/media/compress-image?secret=input", origin)).toBe("/media/[tool]");
    expect(publicPath("/admin", origin)).toBeNull();
    expect(publicPath("/hi/admin/tools", origin)).toBeNull();
  }
});

test("a malformed supplied origin cannot permit analytics collection", () => {
  for (const origin of ["", "not-an-origin", "//admin.smarttools.lol", "https://", "file:///admin"]) {
    expect(publicPath("/", origin)).toBeNull();
  }
});

test("admin visits never load GA or queue configuration and events, regardless of consent", () => {
  for (const saved of [undefined, "accepted", "declined"]) {
    for (const origin of ["https://admin.smarttools.lol", "http://admin.localhost:3000"]) {
      for (const pathname of ["/", "/privacy", "/media/compress-image", "/hi/media/compress-image"]) {
        const { browser, scripts, events } = browserFixture(saved);
        browser.location = { origin, pathname };
        const client = createAnalytics(browser, "G-TEST");
        client.pageView();
        client.track("tool_start", "compress-image");
        client.setConsent("accepted");
        client.track("result_download", "compress-image");
        expect(scripts).toEqual([]);
        expect(browser.dataLayer).toBeUndefined();
        expect(events()).toEqual([]);
        expect(browser["ga-disable-G-TEST"]).toBe(true);
      }
    }
  }
});

test("invalid browser origins fail closed before GA script or event collection", () => {
  const { browser, scripts, events } = browserFixture("accepted");
  browser.location.origin = "not-an-origin";
  const client = createAnalytics(browser, "G-TEST");
  client.pageView();
  client.track("tool_start", "compress-image");
  expect(scripts).toEqual([]);
  expect(browser.dataLayer).toBeUndefined();
  expect(events()).toEqual([]);
  expect(browser["ga-disable-G-TEST"]).toBe(true);
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

test("public visits never include an admin origin in configuration or page-view referrers", () => {
  const { browser, scripts, events } = browserFixture("accepted");
  browser.document.referrer = "https://admin.smarttools.lol/users?secret=private#token";
  const client = createAnalytics(browser, "G-TEST");
  client.pageView();
  scripts[0].onload();
  const configs = browser.dataLayer.map((entry) => [...entry]).filter(([command]) => command === "config");
  expect(configs).not.toHaveLength(0);
  expect(configs.every(([, , context]) => context.page_referrer === "")).toBe(true);
  expect(events()).toHaveLength(1);
  expect(events()[0][2].page_referrer).toBe("");
});

test("shared URL inputs never enter GA4 configuration or events when a fragment changes", () => {
  const { browser, scripts, events } = browserFixture("accepted");
  browser.location.pathname = "/devtools/text-case-converter";
  browser.location.hash = `#share=${encodeURIComponent(JSON.stringify({ v: 1, input: "private shared input" }))}`;
  browser.location.href = `${browser.location.origin}${browser.location.pathname}${browser.location.hash}`;
  const client = createAnalytics(browser, "G-TEST");
  client.pageView();
  scripts[0].onload();
  browser.location.hash = `#share=${encodeURIComponent(JSON.stringify({ v: 1, input: "updated private input" }))}`;
  browser.location.href = `${browser.location.origin}${browser.location.pathname}${browser.location.hash}`;
  client.pageView();
  client.track("tool_complete", "text-case-converter");
  expect(events().filter(([, name]) => name === "page_view")).toHaveLength(1);
  expect(events().at(-1)[2].page_location).toBe("https://smarttools.lol/devtools/[tool]");
  expect(JSON.stringify(browser.dataLayer)).not.toMatch(/share=|private|%7B/);
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

test("a delayed script load after admin navigation sends no configuration or events", () => {
  const { browser, scripts, events } = browserFixture("accepted");
  const client = createAnalytics(browser, "G-TEST");
  client.pageView();
  const queuedBeforeAdmin = browser.dataLayer.length;
  browser.location.origin = "https://admin.smarttools.lol";
  browser.location.pathname = "/";
  client.pageView();
  scripts[0].onload();
  client.track("tool_complete", "compress-image");
  expect(browser.dataLayer).toHaveLength(queuedBeforeAdmin);
  expect(events()).toEqual([]);
  expect(browser["ga-disable-G-TEST"]).toBe(true);

  browser.location.origin = "https://smarttools.lol";
  client.pageView();
  client.pageView();
  expect(scripts).toHaveLength(1);
  expect(browser["ga-disable-G-TEST"]).toBe(false);
  expect(events()).toEqual([
    ["event", "page_view", { page_location: "https://smarttools.lol/", page_referrer: "", page_title: "SmartTools" }],
  ]);
});

test("loaded analytics stop collecting on an admin host and return with a safe public view", () => {
  const { browser, scripts, events } = browserFixture("accepted");
  const client = createAnalytics(browser, "G-TEST");
  client.pageView();
  scripts[0].onload();
  const queuedBeforeAdmin = browser.dataLayer.length;
  browser.location.origin = "http://admin.localhost:3000";
  browser.location.pathname = "/media/compress-image";
  client.pageView();
  client.track("result_copy", "compress-image");
  expect(browser.dataLayer).toHaveLength(queuedBeforeAdmin);
  expect(events()).toHaveLength(1);
  expect(browser["ga-disable-G-TEST"]).toBe(true);

  browser.location.origin = "https://smarttools.lol";
  client.pageView();
  expect(events()).toHaveLength(2);
  expect(events().at(-1)[2]).toEqual({
    page_location: "https://smarttools.lol/media/[tool]",
    page_referrer: "",
    page_title: "SmartTools",
  });
  expect(browser["ga-disable-G-TEST"]).toBe(false);
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
