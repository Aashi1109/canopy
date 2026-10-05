import redis from "redis";
import { expect, test, vi } from "vitest";
import { catalogCache } from "@/lib/tool-framework/catalogCache.ts";
import markdownDefinition from "../tools/markdown-previewer/definition.ts";
import { extractToolMessages, escapeToolText } from "../lib/tool-framework/translations.ts";
import { getPaperworkToolMessages } from "../lib/paperwork/toolMessages.ts";

const state = vi.hoisted(() => ({ configured: true, rows: [], content: [], failure: false, reads: 0 }));
vi.mock("@/db/index.ts", () => ({
  managedToolsTable: {},
  isDatabaseConfigured: () => state.configured,
  db: {
    select: () => ({
      from: async () => {
        state.reads++;
        if (state.failure) throw new Error("Database unavailable");
        return structuredClone(state.rows);
      },
    }),
  },
  getToolContentRows: async () => structuredClone(state.content),
}));

function row(app, key, changes = {}) {
  const value = {
    toolId: `${app}.${key}`,
    app,
    slug: key,
    name: key,
    description: "Public tool",
    order: 0,
    enabled: true,
    archived: false,
    iconUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...changes,
  };
  const messages =
    app === "paperwork"
      ? {
          name: escapeToolText(value.name),
          description: escapeToolText(value.description),
          ...getPaperworkToolMessages(key),
        }
      : extractToolMessages({ ...markdownDefinition, name: value.name, description: value.description });
  return { ...value, translations: { en: { status: "published", messages } } };
}
const { getTools, getPublicTools, getPaperworkTools, resolveToolPage } =
  await import("@/lib/tool-framework/catalog.ts");

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

test.each([undefined, "Cloudflare-Workers"])(
  "publication is fresh across independent requests in %s",
  async (userAgent) => {
    state.configured = true;
    state.failure = false;
    state.content = [];
    state.reads = 0;
    const tool = row("devtools", "markdown-previewer", { name: "Initial name" });
    state.rows = [tool];
    const navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
      if (userAgent) Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent } });
      expect((await getTools())[0].name).toBe("Initial name");
      tool.translations.en.messages.name = "Published update";
      expect((await getPublicTools())[0].name).toBe("Published update");
      tool.translations.hi = {
        status: "published",
        messages: { ...tool.translations.en.messages, name: "पूर्वावलोकन" },
      };
      const [english, hindi] = await Promise.all([getTools("devtools", "en"), getTools("devtools", "hi")]);
      expect(english[0].name).toBe("Published update");
      expect(hindi[0].name).toBe("पूर्वावलोकन");
      expect(hindi[0].href).toBe("/hi/devtools/markdown-previewer");
      expect(hindi[0].messages).not.toHaveProperty("en");
      tool.translations.hi.status = "draft";
      expect(await resolveToolPage("devtools", "markdown-previewer", "hi")).toBeNull();
      expect((await getPublicTools("hi"))[0].href).toBe("/devtools/markdown-previewer");
      tool.enabled = false;
      expect(await getPublicTools()).toEqual([]);
    } finally {
      if (navigator) Object.defineProperty(globalThis, "navigator", navigator);
      else delete globalThis.navigator;
    }
  },
);

test("discovery uses published DB copy, excludes unavailable tools, and retries database failures", async () => {
  state.configured = true;
  state.failure = false;
  state.content = [];
  state.reads = 0;
  const tool = row("devtools", "markdown-previewer", {
    name: "Preview Markdown",
    iconUrl: "https://example.test/icon.png",
  });
  const source = {
    ...markdownDefinition,
    name: tool.name,
    description: tool.description,
    keywords: ["published-keyword"],
  };
  tool.translations.en.messages = extractToolMessages(source, { seoTitle: "Published title" });
  state.content = [
    {
      toolId: tool.toolId,
      category: null,
      keywords: ["published-keyword"],
      seoTitle: "Published title",
      seoDescription: null,
      contentDoc: null,
      docVersion: 1,
      publishedAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  state.rows = [
    tool,
    row("paperwork", "invoice-generator", { slug: "custom-invoice" }),
    row("paperwork", "receipt-generator"),
    row("paperwork", "disabled", { enabled: false }),
    row("paperwork", "archived", { archived: true }),
    row("paperwork", "invalid", { slug: "api" }),
    row("devtools", "not-shipped"),
  ];
  const redisSpy = vi.spyOn(redis, "createClient").mockImplementation(() => {
    throw new Error("Public reads must not use Redis");
  });
  try {
    const tools = await getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].keywords).toEqual(["published-keyword"]);
    expect(tools[0].seoTitle).toBe("Published title");
    expect(tools[0].icon).toEqual({ kind: "url", url: tool.iconUrl });
    const paperwork = await getPaperworkTools();
    expect(paperwork.map((item) => item.componentKey)).toEqual(["invoice-generator", "receipt-generator"]);
    expect((await getPublicTools()).map((item) => item.href)).toContain("/paperwork/custom-invoice");
    expect(await getPublicTools()).toHaveLength(3);
    state.failure = true;
    await expect(getPublicTools()).rejects.toThrow("Database unavailable");
    state.failure = false;
    expect(await getPublicTools()).toHaveLength(3);
    state.configured = false;
    expect(await getPublicTools()).toEqual([]);
    state.configured = true;
    expect(await getPublicTools()).toHaveLength(3);
    expect(redisSpy).not.toHaveBeenCalled();
  } finally {
    redisSpy.mockRestore();
  }
});
