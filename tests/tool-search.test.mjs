import { afterAll, expect, test, vi } from "vitest";
import { searchTools } from "../lib/tool-catalog/index.ts";

// Hoisted so the vi.mock factory below can read the shared catalog fixture.
const state = vi.hoisted(() => {
  const shared = { tools: [], reads: 0, failure: false, locales: [], families: [] };
  globalThis.__toolSearchTest = shared;
  return shared;
});

vi.mock("@sentry/core", () => ({ captureException: () => {} }));
vi.mock("@/lib/tool-framework/catalog", () => ({
  getPublicToolListings: async (locale, family) => {
    state.reads++;
    state.locales.push(locale);
    state.families.push(family);
    if (state.failure) throw new Error("Database unavailable");
    return family ? state.tools.filter((tool) => tool.app === family) : state.tools;
  },
}));

const { GET } = await import("@/app/api/tools/search/route.ts");

afterAll(() => {
  delete globalThis.__toolSearchTest;
});

test("global search matches the public catalog including Paperwork and preserves its response contract", async () => {
  const tools = [
    {
      app: "paperwork",
      category: "Documents",
      categoryKey: null,
      description: "Create bills for clients",
      href: "/paperwork/invoice-generator",
      icon: { kind: "url", url: "https://example.test/invoice.png" },
      keywords: ["receipt", "billing"],
      name: "Invoice Generator",
      toolId: "paperwork.invoice-generator",
    },
    ...Array.from({ length: 8 }, (_, index) => ({
      app: "devtools",
      category: "Text Tools",
      categoryKey: "text-tools",
      description: "Manipulate text",
      href: `/devtools/text-${index}`,
      icon: { kind: "svg", svg: "<svg/>" },
      keywords: ["words"],
      name: `Text ${index}`,
      toolId: `devtools.text-${index}`,
    })),
    {
      app: "devtools",
      category: "Text Tools",
      categoryKey: "text-tools",
      description: "Manipulate text",
      href: "/devtools/text",
      icon: { kind: "svg", svg: "<svg/>" },
      keywords: ["words"],
      name: "Text",
      toolId: "devtools.text",
    },
  ];
  state.tools = tools;
  state.reads = 0;
  state.failure = false;
  const search = (query) =>
    GET(
      new Request(`https://app.test/api/tools/search${query === undefined ? "" : `?q=${encodeURIComponent(query)}`}`),
    );
  for (const query of [undefined, "", "   "]) {
    expect(await (await search(query)).json()).toEqual({ results: [] });
  }
  expect(state.reads, "empty searches do not load the catalog").toBe(0);

  const { category, description, href, icon, name, toolId } = tools[0];
  for (const query of ["  INVOICE  ", "bills", "DOCUMENTS", "receipt"]) {
    expect(await (await search(query)).json()).toEqual({
      results: [{ category, description, href, icon, name, toolId }],
    });
  }
  const textResults = await (await search("text")).json();
  expect(
    textResults.results.map((tool) => tool.toolId),
    "all matches are returned, with a late exact name match ranked first",
  ).toEqual([tools.at(-1), ...tools.slice(1, -1)].map((tool) => tool.toolId));
  expect(await (await search("does not exist")).json()).toEqual({ results: [] });
  state.failure = true;
  const failed = await search("invoice");
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ error: "Database unavailable" });
  state.failure = false;
  expect((await search("invoice")).status).toBe(200);
});

function tool(name, overrides = {}) {
  return { name, description: "", keywords: [], category: "", ...overrides };
}

test("global search suggestions fall back to one public tool per available family with the search response contract", async () => {
  state.failure = false;
  const catalog = ["Zebra", "Alpha", "Markdown", "CSV", "Invoice"].map((name, index) => ({
    app: "devtools",
    category: "Text Tools",
    description: `Work with ${name}`,
    href: `/devtools/catalog-${index}`,
    icon: { kind: "svg", svg: "<svg/>" },
    keywords: ["text"],
    name,
    toolId: `devtools.catalog-${index}`,
  }));
  for (const tools of [catalog, catalog.slice(1), catalog.slice(0, 1), []]) {
    state.tools = tools;
    state.reads = 0;
    const response = await GET(new Request("https://app.test/api/tools/search?suggestions=1&q=%20"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: tools.slice(0, 1).map(({ category, description, href, icon, name, toolId }) => ({
        category,
        description,
        href,
        icon,
        name,
        toolId,
      })),
    });
    expect(state.reads).toBe(1);
  }
});

test.each([
  [undefined, ["devtools.json-formatter", "media.merge-pdf", "paperwork.invoice-generator"]],
  ["devtools", ["devtools.json-formatter", "devtools.qr-code-generator", "devtools.json-editor"]],
  ["media", ["media.merge-pdf", "media.resize-image", "media.compress-image"]],
  ["paperwork", ["paperwork.invoice-generator", "paperwork.receipt-generator", "paperwork.expense-report"]],
])("search suggestions prefer curated tools for %s while keeping live catalog URLs", async (family, preferredIds) => {
  state.tools = [
    tool("Fallback", { app: family ?? "devtools", toolId: "devtools.fallback", href: "/custom/fallback" }),
    ...[...preferredIds]
      .reverse()
      .map((toolId, index) =>
        tool(`Live name ${index}`, { app: toolId.split(".")[0], toolId, href: `/custom/live-${index}` }),
      ),
  ];
  state.failure = false;
  const url = `https://app.test/api/tools/search?suggestions=1${family ? `&family=${family}` : ""}`;
  const response = await GET(new Request(url));
  expect((await response.json()).results.map(({ toolId, href }) => ({ toolId, href }))).toEqual(
    preferredIds.map((toolId) => ({ toolId, href: state.tools.find((entry) => entry.toolId === toolId).href })),
  );

  state.tools = state.tools.filter((entry) => entry.toolId !== preferredIds[0]);
  const unavailable = await GET(new Request(url));
  expect((await unavailable.json()).results.map((entry) => entry.toolId)).toEqual([
    ...preferredIds.slice(1),
    "devtools.fallback",
  ]);
});

test("global suggestions include each available family once and skip missing families", async () => {
  const families = ["paperwork", "devtools", "media"];
  const tools = families.flatMap((app) =>
    Array.from({ length: 4 }, (_, index) =>
      tool(`Tool ${index}`, { app, toolId: `${app}.tool-${index}`, href: `/${app}/tool-${index}` }),
    ),
  );
  state.failure = false;
  for (const availableFamilies of [families, families.filter((app) => app !== "media")]) {
    state.tools = tools.filter((entry) => availableFamilies.includes(entry.app));
    const response = await GET(new Request("https://app.test/api/tools/search?suggestions=1"));
    expect((await response.json()).results.map((entry) => entry.toolId)).toEqual(
      availableFamilies.map((app) => state.tools.find((entry) => entry.app === app).toolId),
    );
  }
});

test.each(["paperwork", "devtools", "media"])(
  "search suggestions are limited to three tools within the %s family",
  async (family) => {
    state.tools = ["paperwork", "devtools", "media"].flatMap((app) =>
      Array.from({ length: 4 }, (_, index) =>
        tool(`Tool ${index}`, { app, toolId: `${app}.tool-${index}`, href: `/${app}/tool-${index}` }),
      ),
    );
    state.reads = 0;
    state.failure = false;
    state.families = [];
    const response = await GET(new Request(`https://app.test/api/tools/search?suggestions=1&family=${family}`));
    expect((await response.json()).results.map((result) => result.toolId)).toEqual(
      state.tools
        .filter((entry) => entry.app === family)
        .slice(0, 3)
        .map((entry) => entry.toolId),
    );
    expect(state.reads).toBe(1);
    expect(state.families).toEqual([family]);

    const search = await GET(new Request(`https://app.test/api/tools/search?suggestions=1&q=tool&family=${family}`));
    expect((await search.json()).results).toHaveLength(4);
    expect(state.families).toEqual([family, family]);
  },
);

test("suggestion requests preserve catalog errors", async () => {
  state.failure = true;
  try {
    const response = await GET(new Request("https://app.test/api/tools/search?suggestions=1"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Database unavailable" });
  } finally {
    state.failure = false;
  }
});

test.each(["paperwork", "devtools", "media"])(
  "search limits results to the %s family while preserving ranking",
  async (family) => {
    state.tools = ["paperwork", "devtools", "media"].flatMap((app) => [
      tool("Format Text", { app, toolId: `${app}.format-text`, href: `/${app}/format-text` }),
      tool("Format", { app, toolId: `${app}.format`, href: `/${app}/format` }),
    ]);
    state.reads = 0;
    state.failure = false;
    state.families = [];

    const response = await GET(new Request(`https://app.test/api/tools/search?q=format&family=${family}`));
    expect(response.status).toBe(200);
    expect((await response.json()).results.map((result) => result.toolId)).toEqual(
      state.tools
        .filter((entry) => entry.app === family)
        .reverse()
        .map((entry) => entry.toolId),
    );
    expect(state.reads).toBe(1);
    expect(state.families).toEqual([family]);

    const missing = await GET(new Request(`https://app.test/api/tools/search?q=missing&family=${family}`));
    expect(await missing.json()).toEqual({ results: [] });
  },
);

test("empty queries with a valid family do not load the catalog", async () => {
  state.reads = 0;
  state.failure = true;
  try {
    for (const query of ["", "&q=", "&q=%20%20", "&suggestions=0"]) {
      const response = await GET(new Request(`https://app.test/api/tools/search?family=media${query}`));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ results: [] });
    }
    expect(state.reads).toBe(0);
  } finally {
    state.failure = false;
  }
});

test.each(["", " ", "unknown", "MEDIA", "media,downloaders", "downloaders"])(
  "search rejects invalid family %j without loading the catalog",
  async (family) => {
    state.reads = 0;
    state.failure = false;
    state.families = [];
    for (const query of ["", "&q=format", "&suggestions=1"]) {
      const response = await GET(
        new Request(`https://app.test/api/tools/search?family=${encodeURIComponent(family)}${query}`),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid tool family" });
    }
    expect(state.reads).toBe(0);
    expect(state.families).toEqual([]);
  },
);

test.each(["", "&q=formato", "&suggestions=1"])(
  "search rejects unsupported locales before loading the catalog for %s",
  async (query) => {
    state.reads = 0;
    const response = await GET(new Request(`https://app.test/api/tools/search?locale=xx&family=devtools${query}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unsupported locale" });
    expect(state.reads).toBe(0);
  },
);

test.each(["q=formato", "suggestions=1"])(
  "localized search and suggestions preserve the selected family and live translated response for %s",
  async (query) => {
    const localized = tool("Formato JSON", {
      app: "devtools",
      category: "Herramientas JSON",
      description: "Dar formato a documentos JSON",
      href: "/es/devtools/json-formatter",
      icon: { kind: "url", url: "https://example.test/json.png" },
      toolId: "devtools.json-formatter",
      locale: "es",
    });
    state.tools = [
      tool("Formato PDF", { app: "media", toolId: "media.merge-pdf", href: "/es/media/merge-pdf", locale: "es" }),
      localized,
    ];
    state.failure = false;
    state.locales = [];
    state.families = [];
    const response = await GET(new Request(`https://app.test/api/tools/search?locale=es&family=devtools&${query}`));
    expect(response.status).toBe(200);
    const { category, description, href, icon, name, toolId, locale } = localized;
    expect(await response.json()).toEqual({ results: [{ category, description, href, icon, name, toolId, locale }] });
    expect(state.locales).toEqual(["es"]);
    expect(state.families).toEqual(["devtools"]);
  },
);

test("search defaults catalog selection to English", async () => {
  state.tools = [];
  state.failure = false;
  state.locales = [];
  state.families = [];
  expect(await (await GET(new Request("https://app.test/api/tools/search?suggestions=1"))).json()).toEqual({
    results: [],
  });
  expect(state.locales).toEqual(["en"]);
  expect(state.families).toEqual([undefined]);
});

test("tool search ranks exact names, prefixes, name substrings, keywords, descriptions, then categories", () => {
  const tools = [
    tool("Category match", { category: "Web & Markup Tools" }),
    tool("Description match", { description: "Read markdown documents" }),
    tool("Keyword match", { keywords: ["markdown"] }),
    tool("CSV to Markdown Table"),
    tool("Markdown Preview"),
    tool("Mark"),
    tool("Unrelated"),
  ];

  expect(searchTools(tools, "mark")).toEqual([tools[5], tools[4], tools[3], tools[2], tools[1], tools[0]]);
});

test("Markdown tools precede broad category matches for both category keys and display labels", () => {
  for (const category of ["web-markup-tools", "Web & Markup Tools"]) {
    const tools = [
      tool("CSS Formatter", { category }),
      tool("CSS Minifier", { category }),
      tool("CSV to Markdown Table", { category: "csv-data-tools" }),
      tool("Markdown to HTML", { category }),
    ];

    expect(searchTools(tools, "mark")).toEqual([tools[3], tools[2], tools[0], tools[1]]);
    expect(searchTools(tools, "Web & Markup")).toEqual([tools[0], tools[1], tools[3]]);
  }
});

test("tool search keeps every match, preserves ties, and does not mutate the input", () => {
  const tools = Object.freeze([
    ...Array.from({ length: 8 }, (_, index) =>
      Object.freeze(tool(`Tool ${index}`, { keywords: Object.freeze(["mark"]) })),
    ),
    Object.freeze(tool("Markdown Editor", { keywords: Object.freeze([]) })),
    Object.freeze(tool("Markdown Viewer", { keywords: Object.freeze([]) })),
  ]);
  const original = [...tools];

  expect(searchTools(tools, "mark")).toEqual([tools[8], tools[9], ...tools.slice(0, 8)]);
  expect(tools).toEqual(original);
});

test("tool search normalizes queries and matches field text without case sensitivity", () => {
  const tools = [
    tool("MARK"),
    tool("A", { keywords: ["MARKDOWN"] }),
    tool("B", { description: "MARKDOWN" }),
    tool("C", { category: "MARKUP" }),
  ];

  expect(searchTools(tools, "  MaRk  ")).toEqual(tools);
  expect(searchTools(tools, "missing")).toEqual([]);
  expect(searchTools([], "mark")).toEqual([]);
});

test("blank tool searches return a fresh array in catalog order", () => {
  const tools = [tool("Z"), tool("A")];

  for (const query of ["", "   "]) {
    const result = searchTools(tools, query);
    expect(result).toEqual(tools);
    expect(result).not.toBe(tools);
  }
});

test("tool search matches complete phrases within fields without crossing field boundaries", () => {
  const tools = [
    tool("Alpha", { description: "Beta" }),
    tool("Keywords", { keywords: ["alpha", "beta"] }),
    tool("Phrase", { keywords: ["alpha beta"] }),
  ];

  expect(searchTools(tools, "alpha beta")).toEqual([tools[2]]);
});
