import { afterEach, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { managedToolsTable } from "../db/schema.ts";
import { loadManagedToolDefinitions, seedManagedTools } from "../db/seedManagedTools.ts";
import { catalogCache } from "../lib/tool-framework/catalogCache.ts";

const fixture = vi.hoisted(() => ({ rows: [] }));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original();
  return {
    ...actual,
    readdir: async (...args) =>
      (await actual.readdir(...args)).filter((entry) =>
        ["youtube-video-downloader", "x-video-downloader", "json-viewer"].includes(entry.name),
      ),
  };
});
vi.mock("@/db/index.ts", () => ({
  managedToolsTable: {},
  isDatabaseConfigured: () => true,
  db: { select: () => ({ from: async () => fixture.rows }) },
  getToolContentRows: async () => [],
}));

afterEach(() => {
  fixture.rows = [];
  catalogCache.clear();
  vi.restoreAllMocks();
});

test("the seed scan includes service-class downloaders alongside ordinary definitions", async () => {
  const scan = await loadManagedToolDefinitions();
  expect(scan.total).toBe(3);
  expect(scan.skipped).toBe(0);
  expect(scan.definitions.map(({ spec }) => spec.toolId).sort()).toEqual([
    "devtools.json-viewer",
    "media.x-video-downloader",
    "media.youtube-video-downloader",
  ]);
});

test("seeding keeps new downloaders disabled and preserves existing catalog decisions", async () => {
  const stored = new Map([
    [
      "media.youtube-video-downloader",
      {
        toolId: "media.youtube-video-downloader",
        app: "media",
        slug: "saved-youtube-slug",
        name: "Saved name",
        order: 8,
        enabled: true,
      },
    ],
  ]);
  const contents = new Set();
  const dialect = new PgDialect();
  const database = {
    select(columns) {
      return {
        from() {
          return {
            where(condition) {
              const [value] = dialect.sqlToQuery(condition).params;
              if ("highest" in columns) {
                return Promise.resolve([
                  {
                    highest: Math.max(
                      -1,
                      ...[...stored.values()].filter((row) => row.app === value).map((row) => row.order),
                    ),
                  },
                ]);
              }
              return { limit: async () => (stored.has(value) ? [{ slug: stored.get(value).slug }] : []) };
            },
          };
        },
      };
    },
    insert(table) {
      return {
        values(row) {
          return {
            async onConflictDoNothing() {
              if (table === managedToolsTable) {
                if (!stored.has(row.toolId)) stored.set(row.toolId, row);
              } else contents.add(row.toolId);
            },
          };
        },
      };
    },
  };
  await seedManagedTools(database);
  await seedManagedTools(database);
  expect(stored.size).toBe(3);
  expect(stored.get("media.youtube-video-downloader")).toMatchObject({
    slug: "saved-youtube-slug",
    name: "Saved name",
    enabled: true,
    order: 8,
  });
  expect(stored.get("media.x-video-downloader")).toMatchObject({ enabled: false, order: 9 });
  expect(stored.get("devtools.json-viewer")).toMatchObject({ enabled: true, order: 0 });
  expect(contents.size).toBe(3);
});

test("catalog publication stays database-owned and an edited downloader slug resolves to its service", async () => {
  const { getTools, resolveToolPage } = await import("../lib/tool-framework/catalog.ts");
  const { getAdminTools } = await import("../lib/tool-framework/manifest.ts");
  expect(await getTools("media")).toEqual([]);
  fixture.rows = [
    {
      toolId: "media.youtube-video-downloader",
      app: "media",
      slug: "save-youtube",
      name: "YouTube downloads",
      description: "Saved catalog description",
      enabled: false,
      archived: false,
      order: 0,
      iconUrl: null,
    },
  ];
  catalogCache.clear();
  expect(await getTools("media")).toEqual([]);
  expect((await getAdminTools())[0]).toMatchObject({ hasDefinition: true, enabled: false });
  fixture.rows[0].enabled = true;
  catalogCache.clear();
  expect(await resolveToolPage("media", "youtube-video-downloader")).toBeNull();
  expect(await resolveToolPage("media", "save-youtube")).toBeNull();
  expect(await getTools("media")).toEqual([]);
  expect(await getTools("downloaders")).toHaveLength(1);
  expect(await resolveToolPage("downloaders", "save-youtube")).toMatchObject({
    name: "YouTube downloads",
    app: "downloaders",
    href: "/downloaders/save-youtube",
    definitionKey: "youtube-video-downloader",
    spec: { job: { kind: "download", platform: "youtube" } },
  });
});
