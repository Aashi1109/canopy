import redis from "redis";
import { expect, test, vi } from "vitest";
import { catalogCache } from "@/lib/tool-framework/catalogCache.ts";

// catalog.ts reads the database through @/db/index.ts; back it with the per-test
// fixture on globalThis (read lazily so factory-eval timing does not matter).
vi.mock("@/db/index.ts", () => ({
  managedToolsTable: {},
  isDatabaseConfigured: () => globalThis.__catalogCacheTest.configured,
  db: {
    select() {
      return {
        async from() {
          const fixture = globalThis.__catalogCacheTest;
          fixture.reads++;
          if (fixture.failure) throw new Error("Database unavailable");
          const rows = structuredClone(fixture.rows);
          await fixture.readGate;
          return rows;
        },
      };
    },
  },
  getToolContentRows: async () => {
    const fixture = globalThis.__catalogCacheTest;
    fixture.contentReads++;
    return structuredClone(fixture.content);
  },
}));

test("separately loaded server modules share catalog storage and invalidation", async () => {
  try {
    const { catalogCache: separateModuleCache } = await import("@/lib/tool-framework/catalogCache.ts?separate-bundle");
    const snapshot = { tools: [], paperworkTools: [], publicTools: [] };
    catalogCache.set("all", snapshot);
    expect(separateModuleCache.get("all")).toBe(snapshot);
    separateModuleCache.clear();
    expect(catalogCache.has("all")).toBe(false);
  } finally {
    catalogCache.clear();
  }
});

test("Workers read current catalog data without sharing snapshots or pending database work", async () => {
  const date = new Date("2026-09-25T00:00:00Z");
  const fixture = {
    reads: 0,
    contentReads: 0,
    configured: true,
    rows: [
      {
        toolId: "devtools.markdown-previewer",
        app: "devtools",
        slug: "markdown-previewer",
        name: "Initial name",
        description: "Public tool",
        order: 0,
        enabled: true,
        archived: false,
        iconUrl: null,
        createdAt: date,
        updatedAt: date,
      },
    ],
    content: [],
  };
  globalThis.__catalogCacheTest = fixture;
  const navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    const { getTools, getPublicTools } = await import("@/lib/tool-framework/catalog.ts");
    expect((await getTools())[0].name).toBe("Initial name");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "Cloudflare-Workers" },
    });
    fixture.rows[0].name = "Published update";
    expect((await getPublicTools())[0].name, "Workers ignore any existing isolate snapshot").toBe("Published update");

    const gate = Promise.withResolvers();
    fixture.readGate = gate.promise;
    fixture.rows[0].name = "First request";
    const first = getTools();
    fixture.rows[0].name = "Second request";
    const second = getTools();
    gate.resolve();
    expect((await first)[0].name).toBe("First request");
    expect((await second)[0].name, "independent requests cannot reuse in-flight database work").toBe("Second request");
    fixture.rows[0].enabled = false;
    expect(await getPublicTools(), "disabling a tool takes effect on the next request").toEqual([]);
    expect(fixture.reads).toBe(5);
  } finally {
    catalogCache.clear();
    delete globalThis.__catalogCacheTest;
    if (navigator) Object.defineProperty(globalThis, "navigator", navigator);
    else delete globalThis.navigator;
  }
});

test("public catalog caches resolved tools across ecosystems and refreshes on invalidation or expiry", async () => {
  const date = new Date("2026-09-16T00:00:00Z");
  const row = (app, key, changes = {}) => ({
    toolId: `${app}.${key}`,
    app,
    slug: key,
    name: key,
    description: "Public tool",
    order: 0,
    enabled: true,
    archived: false,
    iconUrl: null,
    createdAt: date,
    updatedAt: date,
    ...changes,
  });
  const fixture = {
    reads: 0,
    contentReads: 0,
    failure: false,
    configured: true,
    rows: [
      row("devtools", "markdown-previewer", { name: "Preview Markdown", iconUrl: "https://example.test/markdown.png" }),
      row("paperwork", "invoice-generator", { name: "Invoice Generator", slug: "custom-invoice" }),
      row("paperwork", "receipt-generator", { order: 2 }),
      row("paperwork", "disabled", { enabled: false }),
      row("paperwork", "archived", { archived: true }),
      row("paperwork", "no-slug", { slug: null }),
      row("paperwork", "reserved", { slug: "api" }),
      row("devtools", "not-shipped"),
    ],
    content: [
      {
        toolId: "devtools.markdown-previewer",
        category: null,
        keywords: ["published-keyword"],
        seoTitle: "Published title",
        seoDescription: null,
        contentDoc: null,
        docVersion: 1,
        publishedAt: date,
        updatedAt: date,
      },
    ],
  };
  globalThis.__catalogCacheTest = fixture;
  const previousRedis = process.env.REDIS_URL;
  process.env.REDIS_URL = "redis://cache.example.test:6379";
  let redisCalls = 0;
  const redisSpy = vi.spyOn(redis, "createClient").mockImplementation(() => {
    redisCalls++;
    throw new Error("Public reads must not use Redis");
  });
  let now = 0;
  const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
  try {
    const { getTools, getPublicTools, getPaperworkTools, resolveToolPage, relatedTools } =
      await import("@/lib/tool-framework/catalog.ts");
    const [first, publicTools, paperwork] = await Promise.all([getTools(), getPublicTools(), getPaperworkTools()]);
    expect(first.length).toBe(1);
    expect(first[0].seoTitle).toBe("Published title");
    expect(first[0].icon).toEqual({ kind: "url", url: fixture.rows[0].iconUrl });
    expect(await getTools(), "the resolved catalog itself is reused").toBe(first);
    expect(await getPublicTools()).toBe(publicTools);
    expect(fixture.reads, "concurrent consumers share one database load").toBe(1);
    expect(fixture.contentReads).toBe(1);
    expect(paperwork.map((tool) => tool.componentKey)).toEqual(["invoice-generator", "receipt-generator"]);
    expect(publicTools.length, "unavailable, invalid and unshipped tools are excluded").toBe(3);
    const invoice = publicTools.find((tool) => tool.toolId === "paperwork.invoice-generator");
    expect(invoice.href).toBe("/paperwork/custom-invoice");
    expect(invoice.category).toBe("Documents");
    expect(invoice.categoryKey).toBe(null);
    expect(publicTools[0].keywords).toEqual(["published-keyword"]);
    expect((await resolveToolPage("devtools", "markdown-previewer")).name).toBe("Preview Markdown");
    expect(await relatedTools(first[0].toolId)).toEqual([]);
    expect(fixture.reads).toBe(1);

    fixture.rows[0].name = "Updated name";
    fixture.rows[0].iconUrl = null;
    fixture.content[0].publishedAt = null;
    fixture.rows[1].name = "Updated Invoice";
    expect((await getTools())[0].name).toBe("Preview Markdown");
    catalogCache.clear();
    const updated = await getTools();
    expect(updated[0].name).toBe("Updated name");
    expect(updated[0].icon.kind).toBe("svg");
    expect(updated[0].seoTitle, "unpublished content cannot leak from cache").not.toBe("Published title");
    expect((await getPublicTools()).find((tool) => tool.toolId === invoice.toolId).name).toBe("Updated Invoice");
    expect(fixture.reads).toBe(2);

    now = 24 * 60 * 60 * 1_000 - 1;
    await getPublicTools();
    expect(fixture.reads, "snapshot lives for the full 24-hour TTL").toBe(2);
    now++;
    fixture.rows[0].enabled = false;
    expect(await getTools()).toEqual([]);
    expect((await getPublicTools()).length).toBe(2);
    expect(fixture.reads).toBe(3);

    catalogCache.clear();
    fixture.failure = true;
    await expect(getPublicTools()).rejects.toThrow(/Database unavailable/);
    fixture.failure = false;
    expect((await getPublicTools()).length, "failed loads can be retried").toBe(2);
    expect(fixture.reads).toBe(5);
    expect(redisCalls, "public reads never contact Redis even when configured").toBe(0);

    catalogCache.clear();
    fixture.configured = false;
    expect(await getPublicTools()).toEqual([]);
    expect(fixture.reads).toBe(5);
    fixture.configured = true;
    expect((await getPublicTools()).length, "missing configuration is not cached").toBe(2);
  } finally {
    catalogCache.clear();
    redisSpy.mockRestore();
    dateSpy.mockRestore();
    delete globalThis.__catalogCacheTest;
    if (previousRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedis;
  }
});
