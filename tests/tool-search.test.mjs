import { afterAll, expect, test, vi } from "vitest";
import { searchTools } from "../lib/tool-catalog/index.ts";

// Hoisted so the vi.mock factory below can read the shared catalog fixture.
const state = vi.hoisted(() => {
  const shared = { tools: [], reads: 0, failure: false };
  globalThis.__toolSearchTest = shared;
  return shared;
});

vi.mock("@sentry/core", () => ({ captureException: () => {} }));
vi.mock("@/lib/tool-framework/catalog", () => ({
  getPublicTools: async () => {
    state.reads++;
    if (state.failure) throw new Error("Database unavailable");
    return state.tools;
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
