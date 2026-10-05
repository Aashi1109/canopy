import { afterAll, expect, test, vi } from "vitest";
import { locales, localizeHref } from "@/lib/i18n/config.ts";

const state = vi.hoisted(() => {
  const previousSelf = globalThis.self;
  globalThis.self = { __SW_MANIFEST: [{ url: "/asset.js", revision: "asset-revision" }] };
  return { previousSelf, workerOptions: null, buildOptions: null };
});
vi.mock("@serwist/next/worker", () => ({ defaultCache: [] }));
vi.mock("serwist", () => ({
  NetworkOnly: class {},
  Serwist: class {
    constructor(options) {
      state.workerOptions = options;
    }
    addEventListeners() {}
  },
}));
vi.mock("@serwist/next", () => ({
  default: (options) => {
    state.buildOptions = options;
    return (config) => config;
  },
}));
vi.mock("@sentry/nextjs/config", () => ({ withSentryConfig: (config) => config }));
vi.mock("next-intl/plugin", () => ({ default: () => (config) => config }));
await import("@/app/sw.ts");
await import("@/next.config.ts");
afterAll(() => {
  globalThis.self = state.previousSelf;
});

test("offline navigation selects exactly its URL locale and never handles data requests", () => {
  const entries = state.workerOptions.fallbacks.entries;
  for (const locale of locales) {
    const request = {
      destination: "document",
      url: `https://example.test${localizeHref("/devtools/json-formatter?x=1", locale)}`,
    };
    expect(entries.filter(({ matcher }) => matcher({ request })).map(({ url }) => url)).toEqual([
      localizeHref("/offline", locale),
    ]);
    expect(entries.some(({ matcher }) => matcher({ request: { ...request, destination: "script" } }))).toBe(false);
  }
  const unknown = { destination: "document", url: "https://example.test/unknown/path" };
  expect(entries.filter(({ matcher }) => matcher({ request: unknown })).map(({ url }) => url)).toEqual(["/offline"]);
  expect(state.workerOptions.precacheOptions.fetchOptions.credentials).toBe("omit");
});

test("build precaches all locale fallbacks, retains assets and refreshes HTML with bundle revisions", async () => {
  const transform = state.buildOptions.manifestTransforms[0];
  const assets = [{ url: "/_next/static/app.js", revision: "one" }];
  const first = await transform(assets);
  expect(first.manifest[0]).toEqual(assets[0]);
  expect(first.manifest.slice(1).map(({ url }) => url)).toEqual(
    locales.map((locale) => localizeHref("/offline", locale)),
  );
  expect(new Set(first.manifest.slice(1).map(({ revision }) => revision)).size).toBe(1);
  const unchanged = await transform(assets);
  expect(unchanged).toEqual(first);
  const changed = await transform([{ ...assets[0], revision: "two" }]);
  expect(changed.manifest[1].revision).not.toBe(first.manifest[1].revision);
});
