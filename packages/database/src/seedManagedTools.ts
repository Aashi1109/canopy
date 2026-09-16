import { readFile, readdir } from "node:fs/promises";
import { isValidToolSlug, slugFromName, type ToolApp } from "@smarttools/tool-catalog";
import { eq, max } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema.ts";
import { managedToolsTable, toolContentTable } from "./schema.ts";

type SeedToolApp = Extract<ToolApp, "devtools" | "media">;

interface SeedToolSpec {
  toolId: string;
  app: SeedToolApp;
  slug: string;
  name: string;
  description: string;
}

interface LoadedToolDefinition {
  definitionKey: string;
  spec: SeedToolSpec;
}

export interface ManagedToolSeedScan {
  definitions: LoadedToolDefinition[];
  migrated: number;
  skipped: number;
  total: number;
}

export interface ManagedToolSeedCounts {
  migrated: number;
  skipped: number;
  total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSeedToolApp(value: unknown): value is SeedToolApp {
  return value === "devtools" || value === "media";
}

function parseToolDefinition(definitionKey: string, value: unknown): SeedToolSpec {
  const location = `tools/${definitionKey}/definition.ts`;
  if (!isRecord(value)) {
    throw new Error(`✗ ${location}: default export must be an object literal.`);
  }
  if (!isSeedToolApp(value.app)) {
    throw new Error(`✗ ${location}: app must be "devtools" or "media".`);
  }

  const expectedToolId = `${value.app}.${definitionKey}`;
  if (value.toolId !== expectedToolId) {
    throw new Error(
      `✗ ${location}: toolId must be "${expectedToolId}" to match its app and folder.`,
    );
  }
  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new Error(`✗ ${location}: name must be a non-empty string.`);
  }
  if (typeof value.description !== "string" || !value.description.trim()) {
    throw new Error(`✗ ${location}: description must be a non-empty string.`);
  }
  if (typeof value.category !== "string" || !value.category.trim()) {
    throw new Error(`✗ ${location}: category must be a non-empty string.`);
  }
  if (
    !Array.isArray(value.keywords) ||
    !value.keywords.every((keyword) => typeof keyword === "string")
  ) {
    throw new Error(`✗ ${location}: keywords must be an array of strings.`);
  }
  for (const field of ["input", "settings", "trigger", "labels", "content"]) {
    if (!Object.hasOwn(value, field)) {
      throw new Error(`✗ ${location}: default export is missing ${field}.`);
    }
  }
  if (Object.hasOwn(value, "slug") && value.slug !== undefined && typeof value.slug !== "string") {
    throw new Error(`✗ ${location}: slug must be a string when provided.`);
  }

  const slug = value.slug ?? slugFromName(value.name);
  if (!isValidToolSlug(value.app, slug)) {
    throw new Error(`✗ ${location}: slug "${slug}" is invalid or reserved.`);
  }

  return {
    toolId: expectedToolId,
    app: value.app,
    slug,
    name: value.name,
    description: value.description,
  };
}

export async function loadManagedToolDefinitions(): Promise<ManagedToolSeedScan> {
  const toolsDirectory = new URL("../../../tools/", import.meta.url);
  const folders = (await readdir(toolsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name);
  const definitions: LoadedToolDefinition[] = [];
  let skipped = 0;

  for (const definitionKey of folders) {
    const definitionUrl = new URL(`${definitionKey}/definition.ts`, toolsDirectory);
    const source = await readFile(definitionUrl, "utf8");
    if (!/^\s*export\s+default\b/m.test(source)) {
      console.warn(`Skipping tools/${definitionKey}: definition.ts has no default export.`);
      skipped += 1;
      continue;
    }

    const imported = (await import(definitionUrl.href)) as Record<string, unknown>;
    if (!Object.hasOwn(imported, "default")) {
      console.warn(`Skipping tools/${definitionKey}: definition.ts has no default export.`);
      skipped += 1;
      continue;
    }

    definitions.push({
      definitionKey,
      spec: parseToolDefinition(definitionKey, imported.default),
    });
  }

  const result = {
    definitions,
    migrated: definitions.length,
    skipped,
    total: folders.length,
  };
  console.log(
    `Managed tool definitions: ${result.migrated} migrated / ${result.skipped} skipped / ${result.total} total folders.`,
  );
  return result;
}

export async function seedManagedTools(
  database: PostgresJsDatabase<typeof schema>,
): Promise<ManagedToolSeedCounts> {
  const scan = await loadManagedToolDefinitions();

  /**
   * `sort_order` is unique per app and existing rows keep whatever order they
   * were first seeded with, so a new tool cannot take its index in the folder
   * listing — that slot already belongs to whichever tool was inserted there.
   * New tools are appended after the current maximum instead.
   */
  const nextOrder = new Map<SeedToolApp, number>();
  for (const app of new Set(scan.definitions.map(({ spec }) => spec.app))) {
    const [row] = await database
      .select({ highest: max(managedToolsTable.order) })
      .from(managedToolsTable)
      .where(eq(managedToolsTable.app, app));
    nextOrder.set(app, (row?.highest ?? -1) + 1);
  }

  for (const { definitionKey, spec } of scan.definitions) {
    const [stored] = await database
      .select({ slug: managedToolsTable.slug })
      .from(managedToolsTable)
      .where(eq(managedToolsTable.toolId, spec.toolId))
      .limit(1);

    if (stored && stored.slug !== spec.slug) {
      throw new Error(
        `✗ tools/${definitionKey}: definition declares slug "${spec.slug}" but the database\n` +
          `  has "${stored.slug}". Slugs are immutable once published. Revert the definition, or\n` +
          `  add a redirect and retire this tool under a new toolId.`,
      );
    }

    if (!stored) {
      const order = nextOrder.get(spec.app) ?? 0;
      nextOrder.set(spec.app, order + 1);
      await database
        .insert(managedToolsTable)
        .values({
          toolId: spec.toolId,
          app: spec.app,
          slug: spec.slug,
          name: spec.name,
          description: spec.description,
          order,
          enabled: true,
        })
        .onConflictDoNothing({ target: managedToolsTable.toolId });
    }

    await database
      .insert(toolContentTable)
      .values({ toolId: spec.toolId })
      .onConflictDoNothing({ target: toolContentTable.toolId });
  }

  return {
    migrated: scan.migrated,
    skipped: scan.skipped,
    total: scan.total,
  };
}
