/**
 * Server-side catalogue: the one place that answers "which tools exist?".
 *
 * The invariant this module exists to protect:
 *
 *   ENUMERATION COMES FROM THE DATABASE, NEVER FROM THE BUNDLE.
 *
 * There is no generated registry, no `import.meta.glob`, no array of tools.
 * `managed_tools` is the only list. A tool's *code* is then loaded by folder
 * name via a dynamic import, which is a lookup, not an enumeration: nothing
 * here can tell you what folders exist, only fetch one you already named.
 *
 * Resolution order, and it is load-bearing:
 *
 *   URL slug -> managed_tools row -> toolId -> definitionKey -> tools/<key>/
 *                                              ^ toolId.split(".")[1]
 *
 * The folder is NEVER derived from the slug. Slugs are derived from names and
 * are admin-editable, so plenty of live tools have a slug that differs from
 * their folder name; deriving one from the other 404s them.
 *
 * Every export is wrapped in React's `cache()`, so a request that renders a
 * page, its related tools and its metadata pays for one query, not three.
 */

import { cache } from "react";
import { Cache } from "@smarttools/cache";

import {
  db,
  getToolContentRows,
  getToolIcons,
  isDatabaseConfigured,
  managedToolsTable,
  type ToolContentRow,
  type ToolIconRow,
} from "@smarttools/database";
import { isToolAvailable } from "@smarttools/tool-catalog";

import { isCategoryKey, type CategoryKey, type ToolApp } from "./categories";
import { resolveContent } from "./content";
import { resolveIcon, type ResolvedIcon } from "./icons";
import type { ToolContent, ToolSpec } from "./spec";

/** How many tools `relatedTools` returns, matching the tool page's shelf. */
const RELATED_LIMIT = 3;
const catalogCache = new Cache("catalog");

/** A definition key is a directory name; anything else is not importable. */
const DEFINITION_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ManagedToolRow = typeof managedToolsTable.$inferSelect;

/** One fully resolved tool: shipped declaration + admin-authored overrides. */
export type CatalogTool = {
  readonly toolId: string;
  readonly app: ToolApp;
  /** Public URL segment. Admin-owned, and not the folder name. */
  readonly slug: string;
  /** Folder under `tools/`. Derived from `toolId`, never from `slug`. */
  readonly definitionKey: string;
  readonly name: string;
  readonly description: string;
  readonly order: number;
  readonly category: CategoryKey;
  readonly keywords: readonly string[];
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly content: ToolContent;
  readonly icon: ResolvedIcon;
  readonly href: string;
  readonly spec: ToolSpec;
};

export function definitionKeyOf(toolId: string): string | null {
  const key = toolId.split(".")[1] ?? "";
  return DEFINITION_KEY_PATTERN.test(key) ? key : null;
}

function isToolSpec(value: unknown): value is ToolSpec {
  if (typeof value !== "object" || value === null) return false;
  const spec = value as Partial<ToolSpec>;
  return (
    typeof spec.toolId === "string" &&
    typeof spec.name === "string" &&
    typeof spec.description === "string" &&
    isCategoryKey(spec.category) &&
    Array.isArray(spec.keywords) &&
    typeof spec.content === "object" &&
    spec.content !== null
  );
}

/**
 * Loads one tool's shipped declaration by folder name.
 *
 * Returns `null` rather than throwing: a stale row pointing at a folder that
 * no longer ships must drop out of the catalogue, not break every page that
 * lists it.
 */
export async function loadSpec(definitionKey: string): Promise<ToolSpec | null> {
  try {
    const loaded: unknown = await import(`../../tools/${definitionKey}/definition`);
    const value =
      typeof loaded === "object" && loaded !== null && "default" in loaded
        ? (loaded as { default: unknown }).default
        : null;
    return isToolSpec(value) ? value : null;
  } catch {
    return null;
  }
}

async function buildTool(
  row: ManagedToolRow & { slug: string },
  contentRow: ToolContentRow | null,
  iconRow: ToolIconRow | null,
): Promise<CatalogTool | null> {
  const definitionKey = definitionKeyOf(row.toolId);
  if (!definitionKey) return null;

  const spec = await loadSpec(definitionKey);
  if (!spec || spec.app !== row.app) return null;

  // The admin-authored name/description are the live ones, so they, not the
  // shipped strings, are what the SEO fields fall back to.
  const resolved = resolveContent({ ...spec, name: row.name, description: row.description }, contentRow);

  return {
    toolId: row.toolId,
    app: spec.app,
    slug: row.slug,
    definitionKey,
    name: row.name,
    description: row.description,
    order: row.order,
    category: resolved.category,
    keywords: resolved.keywords,
    seoTitle: resolved.seoTitle,
    seoDescription: resolved.seoDescription,
    content: resolved.content,
    icon: resolveIcon(row.toolId, row.name, iconRow),
    href: `/${spec.app}/${row.slug}`,
    spec: { ...spec, content: resolved.content },
  };
}

/**
 * Reuse the public catalog snapshot across requests for 24 hours.
 * Admin mutations invalidate it after commit; Redis failures use the database.
 */
const loadCatalog = cache(async (): Promise<readonly CatalogTool[]> => {
  if (!isDatabaseConfigured()) return [];

  const { rows, contentRows, icons } = await catalogCache.remember(
    "all",
    async () => {
      const [rows, contentRows, icons] = await Promise.all([
        db.select().from(managedToolsTable),
        getToolContentRows(),
        getToolIcons(),
      ]);
      return {
        rows: rows.filter(isToolAvailable),
        contentRows: contentRows.filter((row) => row.publishedAt !== null),
        icons,
      };
    },
    24 * 60 * 60,
  );

  const contentByToolId = new Map(contentRows.map((contentRow) => [contentRow.toolId, contentRow] as const));

  const built = await Promise.all(
    rows
      .filter(isToolAvailable)
      .map((row) => buildTool(row, contentByToolId.get(row.toolId) ?? null, icons[row.toolId] ?? null)),
  );

  return built
    .filter((tool): tool is CatalogTool => tool !== null)
    .sort((left, right) => (left.app === right.app ? left.order - right.order : left.app.localeCompare(right.app)));
});

/** Every enabled, non-archived, slugged tool. Optionally narrowed to one app. */
export const getTools = cache(async (app?: ToolApp): Promise<readonly CatalogTool[]> => {
  const tools = await loadCatalog();
  return app ? tools.filter((tool) => tool.app === app) : tools;
});

/**
 * Resolves a public URL to a tool.
 *
 * An ambiguous slug resolves to nothing rather than to an arbitrary winner —
 * the same guard `findAvailableToolBySlug` applies, for the same reason.
 */
export const resolveToolPage = cache(async (app: ToolApp, slug: string): Promise<CatalogTool | null> => {
  const matches = (await loadCatalog()).filter((tool) => tool.app === app && tool.slug === slug);
  return matches.length === 1 ? matches[0] : null;
});

/**
 * Curated related tools, falling back to the rest of the same category.
 */
export const relatedTools = cache(async (toolId: string): Promise<readonly CatalogTool[]> => {
  const tools = await loadCatalog();
  const tool = tools.find((candidate) => candidate.toolId === toolId);
  if (!tool) return [];

  const curated = (tool.content.relatedToolIds ?? [])
    .filter((id) => id !== toolId)
    .flatMap((id) => tools.filter((candidate) => candidate.toolId === id));

  const seen = new Set(curated.map((candidate) => candidate.toolId));
  const sameCategory = tools.filter(
    (candidate) => candidate.toolId !== toolId && candidate.category === tool.category && !seen.has(candidate.toolId),
  );

  return [...curated, ...sameCategory].slice(0, RELATED_LIMIT);
});
